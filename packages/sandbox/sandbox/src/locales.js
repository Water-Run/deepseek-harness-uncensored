/** Locale-owned sandbox approval text; audit inputs remain verbatim. */
/** English escalation messages. */
export const en = {
    escalation: (mode, justification) => `Allow this operation with ${mode} permissions: ${justification}`,
};
/** Chinese escalation messages. */
export const zh = {
    escalation: (mode, justification) => `允许本次操作使用 ${mode} 权限：${justification}`,
};
/** Japanese escalation messages. */
export const ja = {
    escalation: (mode, justification) => `${mode} 権限でこの操作を許可します：${justification}`,
};
/** Spanish dictionary, checked against the English keys. */
export const es = {
    escalation: (mode, justification) => `Permitir esta operación con permisos ${mode}: ${justification}`,
};
/** French dictionary, checked against the English keys. */
export const fr = {
    escalation: (mode, justification) => `Autoriser cette opération avec les permissions ${mode} : ${justification}`,
};
/** German dictionary, checked against the English keys. */
export const de = {
    escalation: (mode, justification) => `Diesen Vorgang mit ${mode}-Berechtigungen zulassen: ${justification}`,
};
/** Russian dictionary, checked against the English keys. */
export const ru = {
    escalation: (mode, justification) => `Разрешить эту операцию с правами ${mode}: ${justification}`,
};
/** Portuguese dictionary, checked against the English keys. */
export const pt = {
    escalation: (mode, justification) => `Permitir esta operação com permissões ${mode}: ${justification}`,
};
/**
 * Build translations for the existing Client localized-text resolver.
 * @param mode - requested sandbox mode.
 * @param justification - raw model justification, preserved in every translation.
 * @returns localized approval text.
 */
export function escalationDisplayReason(mode, justification) {
    return {
        en: en.escalation(mode, justification),
        zh: zh.escalation(mode, justification),
        ja: ja.escalation(mode, justification),
        es: es.escalation(mode, justification),
        fr: fr.escalation(mode, justification),
        de: de.escalation(mode, justification),
        ru: ru.escalation(mode, justification),
        pt: pt.escalation(mode, justification),
    };
}
//# sourceMappingURL=locales.js.map