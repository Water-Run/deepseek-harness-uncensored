// Native comparison of the independent Desktop product versions read by NSIS.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#include <windows.h>
#include <cstdio>

extern "C" __declspec(dllimport) int __cdecl InstallerCheckVersion(LPCWSTR installed, LPCWSTR candidate);

int wmain() {
    const struct { LPCWSTR installed; LPCWSTR candidate; int result; } cases[] = {
        { L"2026.11.14.9", L"2026.1114.10", 0 },
        { L"2026.11.14.10", L"2026.1114.9", 1 },
        { L"2026.1114.10", L"2026.11.14.10", 0 },
        { L"2026.12.31.99", L"2027.101.1", 0 },
        { L"2026.02.29.1", L"2026.301.1", -1 },
        { L"2028.02.29.1", L"2028.229.1", 0 },
        { L"2026.00.14.1", L"2026.1114.1", -1 },
        { L"2026.11.14.01", L"2026.1114.1", -1 },
        { L"2026.11.14.65536", L"2026.1114.1", -1 },
        { L"2026.11.14.65535", L"2026.1115.1", 0 },
        { L"0.1.0-test.20261113.5", L"2026.1114.1", 0 },
        { L"2026.11.14.1", L"0.1.0", 1 },
        { L"0.1.0", L"0.1.0", 0 },
        { L"0.1.0", L"0.1.1", 0 },
        { L"0.1.1", L"0.1.0", 1 },
        { L"1.10.0", L"1.9.0", 1 },
        { L"2.0.0", L"1.99.99", 1 },
        { L"1.0.0-alpha", L"1.0.0", 0 },
        { L"1.0.0", L"1.0.0-alpha", 1 },
        { L"1.0.0-alpha", L"1.0.0-alpha.1", 0 },
        { L"1.0.0-alpha.1", L"1.0.0-alpha.beta", 0 },
        { L"1.0.0-beta.11", L"1.0.0-beta.2", 1 },
        { L"1.0.0-beta.11", L"1.0.0-rc.1", 0 },
        { L"1.0.0-9", L"1.0.0-alpha", 0 },
        { L"1.0.0-alpha", L"1.0.0-9", 1 },
        { L"1.0.0-alpha.1", L"1.0.0-alpha", 1 },
        { L"1.0.0-Z", L"1.0.0-a", 0 },
        { L"1.0.0--", L"1.0.0-0", 1 },
        { L"0.1.0-test.20261111.10", L"0.1.0-test.20261111.9", 1 },
        { L"0.1.0-test.20261111.9", L"0.1.0-test.20261111.10", 0 },
        { L"0.1.0-test.999999999999999999999999", L"0.1.0-test.1", 1 },
        { L"", L"0.1.0", -1 },
        { nullptr, L"0.1.0", -1 },
        { L"0.1.0", nullptr, -1 },
        { L"0.1.0", L"broken", -1 },
        { L"v0.1.0", L"0.1.0", -1 },
        { L"0.1", L"0.1.0", -1 },
        { L"0.1.0.1", L"0.1.0", -1 },
        { L"00.1.0", L"0.1.0", -1 },
        { L"0.1.0-", L"0.1.0", -1 },
        { L"0.1.0-a.", L"0.1.0", -1 },
        { L"0.1.0-a..1", L"0.1.0", -1 },
        { L"0.1.0-01", L"0.1.0", -1 },
        { L"0.1.0-\u4e2d", L"0.1.0", -1 },
        { L"0.1.0+build", L"0.1.0", -1 },
        { L"0.1.0", L" 0.1.0", -1 },
    };
    for (const auto& test : cases) {
        if (InstallerCheckVersion(test.installed, test.candidate) != test.result) {
            std::fprintf(stderr, "Unexpected installer version decision\n");
            return 1;
        }
    }
    std::printf("passed: %zu native installer version cases\n", sizeof(cases) / sizeof(cases[0]));
    return 0;
}
