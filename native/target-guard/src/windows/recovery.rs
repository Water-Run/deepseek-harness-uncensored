//! WFP recovery touches only complete, account-owned v2 records after conservative process observation.
use super::*;
use crate::recovery::{RecoveryRecord, RecoveryReport, RetainedRule, MAX_RECORD_BYTES};
use windows_sys::Win32::System::Rpc::UuidFromStringW;

struct Allocation<T>(*mut T);
impl<T> Drop for Allocation<T> {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { FwpmFreeMemory0((&mut self.0 as *mut *mut T).cast()) };
        }
    }
}
struct Enumeration {
    engine: HANDLE,
    handle: HANDLE,
}
impl Drop for Enumeration {
    fn drop(&mut self) {
        if self.handle.is_null() {
            return;
        }
        let code = unsafe { FwpmProviderDestroyEnumHandle0(self.engine, self.handle) };
        if code != 0 {
            eprintln!("target-guard: provider enumeration close failed ({code}).");
        }
    }
}

fn parse_guid(value: &str) -> Result<GUID, Failure> {
    if !crate::recovery::uuid(value) {
        return Err(Failure::new(
            "invalid-record",
            "Invalid guard object identifier.",
        ));
    }
    let mut text = wide(value);
    let mut guid = GUID::default();
    status(
        unsafe { UuidFromStringW(text.as_mut_ptr(), &mut guid) } as u32,
        "UuidFromStringW",
    )?;
    Ok(guid)
}
fn same_guid(left: &GUID, right: &GUID) -> bool {
    left.data1 == right.data1
        && left.data2 == right.data2
        && left.data3 == right.data3
        && left.data4 == right.data4
}
fn invalid_graph() -> Failure {
    Failure::new(
        "modified-rule",
        "Guard object links, conditions or flags differ; retain them for inspection.",
    )
}

fn marked(provider: &FWPM_PROVIDER0) -> bool {
    if provider.displayData.name.is_null() {
        return false;
    }
    "DSHU isolated execution "
        .encode_utf16()
        .enumerate()
        .all(|(index, expected)| unsafe { *provider.displayData.name.add(index) } == expected)
}

fn decode(provider: &FWPM_PROVIDER0) -> Result<RecoveryRecord, Failure> {
    let data = &provider.providerData;
    if data.size == 0 || data.size as usize > MAX_RECORD_BYTES || data.data.is_null() {
        return Err(Failure::new(
            "invalid-record",
            "Invalid guard metadata size.",
        ));
    }
    let bytes = unsafe { std::slice::from_raw_parts(data.data, data.size as usize) };
    let record: RecoveryRecord = serde_json::from_slice(bytes).map_err(|_| {
        Failure::new(
            "unsupported-record",
            "Guard metadata is not a supported recovery generation.",
        )
    })?;
    record.validate()?;
    if record.scope != guid_text(&provider.providerKey)
        || provider.flags != FWPM_PROVIDER_FLAG_PERSISTENT
    {
        return Err(invalid_graph());
    }
    Ok(record)
}

fn read_record(engine: HANDLE, key: &GUID) -> Result<Option<RecoveryRecord>, Failure> {
    let mut allocation = Allocation(null_mut());
    let result = unsafe { FwpmProviderGetByKey0(engine, key, &mut allocation.0) };
    if result == FWP_E_PROVIDER_NOT_FOUND as u32 {
        return Ok(None);
    }
    status(result, "FwpmProviderGetByKey0")?;
    if allocation.0.is_null() {
        return Err(invalid_graph());
    }
    decode(unsafe { &*allocation.0 }).map(Some)
}

fn validate_graph(engine: HANDLE, record: &RecoveryRecord) -> Result<Lease, Failure> {
    let lease = Lease {
        provider: parse_guid(&record.scope)?,
        filters: [
            parse_guid(&record.filters[0])?,
            parse_guid(&record.filters[1])?,
        ],
    };
    let mut sublayer = Allocation(null_mut());
    status(
        unsafe { FwpmSubLayerGetByKey0(engine, &lease.provider, &mut sublayer.0) },
        "FwpmSubLayerGetByKey0",
    )?;
    if sublayer.0.is_null() {
        return Err(invalid_graph());
    }
    let sublayer = unsafe { &*sublayer.0 };
    if sublayer.providerKey.is_null()
        || !same_guid(unsafe { &*sublayer.providerKey }, &lease.provider)
        || sublayer.flags != FWPM_SUBLAYER_FLAG_PERSISTENT
        || sublayer.weight != u16::MAX
    {
        return Err(invalid_graph());
    }
    for (key, layer) in lease.filters.iter().zip([
        FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
        FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6,
    ]) {
        let mut filter = Allocation(null_mut());
        status(
            unsafe { FwpmFilterGetByKey0(engine, key, &mut filter.0) },
            "FwpmFilterGetByKey0",
        )?;
        if filter.0.is_null() {
            return Err(invalid_graph());
        }
        validate_filter(
            unsafe { &*filter.0 },
            &lease.provider,
            &layer,
            &record.container_sid,
        )?;
    }
    Ok(lease)
}

fn validate_filter(
    filter: &FWPM_FILTER0,
    provider: &GUID,
    layer: &GUID,
    sid: &str,
) -> Result<(), Failure> {
    if filter.providerKey.is_null()
        || !same_guid(unsafe { &*filter.providerKey }, provider)
        || !same_guid(&filter.subLayerKey, provider)
        || !same_guid(&filter.layerKey, layer)
        || filter.flags != FWPM_FILTER_FLAG_PERSISTENT
        || filter.action.r#type != FWP_ACTION_BLOCK
        || filter.numFilterConditions != 1
        || filter.filterCondition.is_null()
        || filter.weight.r#type != FWP_UINT64
    {
        return Err(invalid_graph());
    }
    let weight = unsafe { filter.weight.Anonymous.uint64 };
    if weight.is_null() || unsafe { *weight } != u64::MAX {
        return Err(invalid_graph());
    }
    let condition = unsafe { &*filter.filterCondition };
    if !same_guid(&condition.fieldKey, &FWPM_CONDITION_ALE_PACKAGE_ID)
        || condition.matchType != FWP_MATCH_EQUAL
        || condition.conditionValue.r#type != FWP_SID
    {
        return Err(invalid_graph());
    }
    if sid_text(unsafe { condition.conditionValue.Anonymous.sid }.cast())? != sid {
        return Err(invalid_graph());
    }
    Ok(())
}

impl WindowsBackend {
    pub(super) fn recover_owned(
        &mut self,
        owner: Option<&Identity>,
    ) -> Result<RecoveryReport, Failure> {
        let account = user_sid(&self.owner)?;
        let engine = self.engine()?;
        let mut enumeration = Enumeration {
            engine,
            handle: null_mut(),
        };
        status(
            unsafe { FwpmProviderCreateEnumHandle0(engine, null(), &mut enumeration.handle) },
            "FwpmProviderCreateEnumHandle0",
        )?;
        let mut records = Vec::new();
        let mut unrecognized = 0u32;
        let mut seen = 0usize;
        loop {
            let mut entries = Allocation(null_mut());
            let mut count = 0;
            status(
                unsafe {
                    FwpmProviderEnum0(engine, enumeration.handle, 64, &mut entries.0, &mut count)
                },
                "FwpmProviderEnum0",
            )?;
            if count == 0 {
                break;
            }
            seen += count as usize;
            if count > 64 || seen > 4096 || entries.0.is_null() {
                return Err(Failure::new(
                    "recovery-limit",
                    "Provider enumeration exceeds its observation bound.",
                ));
            }
            for &pointer in unsafe { std::slice::from_raw_parts(entries.0, count as usize) } {
                if pointer.is_null() {
                    return Err(invalid_graph());
                }
                let provider = unsafe { &*pointer };
                if !marked(provider) {
                    continue;
                }
                let record = match decode(provider) {
                    Ok(record) => record,
                    Err(_) => {
                        unrecognized += 1;
                        continue;
                    }
                };
                if record.user_sid != account {
                    continue;
                }
                if owner.is_some_and(|owner| owner != &record.owner) {
                    continue;
                }
                if records.len() >= 128 {
                    return Err(Failure::new(
                        "recovery-limit",
                        "Too many owned records for one recovery operation.",
                    ));
                }
                records.push(record);
            }
        }
        drop(enumeration);
        let mut report = RecoveryReport {
            unrecognized,
            ..Default::default()
        };
        for expected in records {
            let key = parse_guid(&expected.scope)?;
            let outcome = self.transaction(|engine| {
                let Some(record) = read_record(engine, &key)? else {
                    return Ok(false);
                };
                if record.user_sid != account || record != expected {
                    return Err(Failure::new(
                        "modified-rule",
                        "Guard metadata changed during recovery.",
                    ));
                }
                let same_boot = record.matches_boot(&observation::boot_identity()?)?;
                if same_boot
                    && (identity_alive(&record.owner)?
                        || identity_alive(&record.helper)?
                        || identity_alive(&record.target)?)
                {
                    return Err(Failure::new(
                        "scope-active",
                        "The original owner, helper or target is still active.",
                    ));
                }
                let lease = validate_graph(engine, &record)?;
                observation::quiescent(&record)?;
                for filter in &lease.filters {
                    status(
                        unsafe { FwpmFilterDeleteByKey0(engine, filter) },
                        "FwpmFilterDeleteByKey0",
                    )?;
                }
                status(
                    unsafe { FwpmSubLayerDeleteByKey0(engine, &lease.provider) },
                    "FwpmSubLayerDeleteByKey0",
                )?;
                status(
                    unsafe { FwpmProviderDeleteByKey0(engine, &lease.provider) },
                    "FwpmProviderDeleteByKey0",
                )?;
                Ok(true)
            });
            match outcome {
                Ok(true) => report.removed.push(expected.scope),
                Ok(false) => {}
                Err(error) => report.retained.push(RetainedRule {
                    scope: expected.scope,
                    code: error.code.into(),
                }),
            }
        }
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::Security::Authorization::ConvertStringSidToSidW;

    #[test]
    fn modified_rule_fields_do_not_authorize_deletion() {
        let expected = guid().unwrap();
        let mut provider = expected;
        let mut sid = null_mut();
        let text = wide("S-1-15-2-1");
        boolean(
            unsafe { ConvertStringSidToSidW(text.as_ptr(), &mut sid) },
            "ConvertStringSidToSidW",
        )
        .unwrap();
        struct Sid(PSID);
        impl Drop for Sid {
            fn drop(&mut self) {
                unsafe { LocalFree(self.0) };
            }
        }
        let sid = Sid(sid);
        let mut weight = u64::MAX;
        let mut condition = FWPM_FILTER_CONDITION0 {
            fieldKey: FWPM_CONDITION_ALE_PACKAGE_ID,
            matchType: FWP_MATCH_EQUAL,
            conditionValue: FWP_CONDITION_VALUE0 {
                r#type: FWP_SID,
                Anonymous: FWP_CONDITION_VALUE0_0 { sid: sid.0.cast() },
            },
        };
        let original = FWPM_FILTER0 {
            providerKey: &mut provider,
            subLayerKey: expected,
            layerKey: FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
            flags: FWPM_FILTER_FLAG_PERSISTENT,
            action: FWPM_ACTION0 {
                r#type: FWP_ACTION_BLOCK,
                ..Default::default()
            },
            numFilterConditions: 1,
            filterCondition: &mut condition,
            weight: FWP_VALUE0 {
                r#type: FWP_UINT64,
                Anonymous: FWP_VALUE0_0 {
                    uint64: &mut weight,
                },
            },
            ..Default::default()
        };
        let check = |filter: &FWPM_FILTER0| {
            validate_filter(
                filter,
                &expected,
                &FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
                "S-1-15-2-1",
            )
        };
        check(&original).unwrap();
        for changed in 0..9 {
            let mut filter = original;
            match changed {
                0 => filter.providerKey = null_mut(),
                1 => filter.subLayerKey = GUID::default(),
                2 => filter.layerKey = FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6,
                3 => filter.flags = 0,
                4 => filter.action.r#type = FWP_ACTION_PERMIT,
                5 => filter.numFilterConditions = 0,
                6 => filter.filterCondition = null_mut(),
                7 => filter.weight.r#type = FWP_UINT8,
                _ => filter.weight.Anonymous.uint64 = null_mut(),
            }
            assert!(check(&filter).is_err(), "changed field {changed}");
        }
        assert!(validate_filter(
            &original,
            &expected,
            &FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
            "S-1-15-2-2"
        )
        .is_err());
        let mut wrong_condition = condition;
        wrong_condition.conditionValue.r#type = FWP_UINT64;
        let modified = FWPM_FILTER0 {
            filterCondition: &mut wrong_condition,
            ..original
        };
        assert!(check(&modified).is_err());
    }

    #[test]
    fn marker_detection_does_not_promote_names_into_ownership() {
        let mut short = wide("DSHU");
        let mut marker = wide("DSHU isolated execution unknown");
        assert!(!marked(&FWPM_PROVIDER0::default()));
        assert!(!marked(&FWPM_PROVIDER0 {
            displayData: FWPM_DISPLAY_DATA0 {
                name: short.as_mut_ptr(),
                description: null_mut()
            },
            ..Default::default()
        }));
        let provider = FWPM_PROVIDER0 {
            displayData: FWPM_DISPLAY_DATA0 {
                name: marker.as_mut_ptr(),
                description: null_mut(),
            },
            ..Default::default()
        };
        assert!(marked(&provider));
        assert!(decode(&provider).is_err());
    }

    #[test]
    fn a_current_owner_is_not_mistaken_for_an_orphan_or_a_reused_pid() {
        let mut current = current_identity().unwrap();
        assert!(identity_alive(&current).unwrap());
        current.created = (current.ticks().unwrap() + 1).to_string();
        assert!(!identity_alive(&current).unwrap());
    }
}
