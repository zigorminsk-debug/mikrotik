/* Experimental Windows-only QEMU supervisor. No paths or commands from IPC.
   A Job Object kills QEMU if this helper or the parent process dies. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
#include <stdlib.h>
#include <stdio.h>

#define MAX_CMD 32760
static int append(wchar_t *dst, size_t *pos, wchar_t c) {
    if (*pos >= MAX_CMD - 1) return 0;
    dst[(*pos)++] = c;
    dst[*pos] = 0;
    return 1;
}
/* Inverse of the Windows CRT command-line parser. */
static int quote_arg(wchar_t *dst, size_t *pos, const wchar_t *arg) {
    size_t slash = 0, i;
    if (!append(dst, pos, L'"')) return 0;
    for (;;) {
        wchar_t ch = *arg++;
        if (ch == L'\\') { slash++; continue; }
        if (ch == L'"' || ch == 0) {
            for (i = 0; i < slash * 2; i++) if (!append(dst, pos, L'\\')) return 0;
            slash = 0;
            if (ch == 0) break;
            if (!append(dst, pos, L'\\') || !append(dst, pos, L'"')) return 0;
        } else {
            for (i = 0; i < slash; i++) if (!append(dst, pos, L'\\')) return 0;
            slash = 0;
            if (!append(dst, pos, ch)) return 0;
        }
    }
    return append(dst, pos, L'"');
}
static DWORD WINAPI wait_parent(LPVOID unused) {
    char buffer[32]; DWORD n = 0; HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    (void)unused;
    while (in != INVALID_HANDLE_VALUE && in != NULL && ReadFile(in, buffer, sizeof(buffer), &n, NULL) && n > 0) {}
    return 0;
}
static void cleanup_disk(const wchar_t *disk) {
    size_t len = wcslen(disk); wchar_t *dir; wchar_t *last;
    if (len < 10 || _wcsicmp(disk + len - 9, L"\\disk.img") != 0) return;
    dir = (wchar_t *)malloc((len + 1) * sizeof(wchar_t));
    if (!dir) return;
    wcscpy_s(dir, len + 1, disk);
    last = wcsrchr(dir, L'\\');
    if (last) {
        *last = 0;
        last = wcsrchr(dir, L'\\');
        if (last && wcsncmp(last + 1, L"session-", 8) == 0) {
            DeleteFileW(disk);
            RemoveDirectoryW(dir); /* only succeeds if empty */
        }
    }
    free(dir);
}
int wmain(int argc, wchar_t **argv) {
    HANDLE job = NULL, thread = NULL; PROCESS_INFORMATION process; STARTUPINFOW startup;
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit; wchar_t *command; size_t used = 0; int i, exit_code = 1;
    DWORD waited;
    if (argc < 4) return 2; /* disk path, QEMU path, QEMU args */
    command = (wchar_t *)calloc(MAX_CMD, sizeof(wchar_t));
    if (!command) return 3;
    for (i = 2; i < argc; i++) {
        if (i > 2 && !append(command, &used, L' ')) goto done;
        if (!quote_arg(command, &used, argv[i])) goto done;
    }
    ZeroMemory(&limit, sizeof(limit));
    job = CreateJobObjectW(NULL, NULL);
    if (!job) goto done;
    limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limit, sizeof(limit))) goto done;
    ZeroMemory(&startup, sizeof(startup)); startup.cb = sizeof(startup);
    ZeroMemory(&process, sizeof(process));
    if (!CreateProcessW(argv[2], command, NULL, NULL, FALSE, CREATE_SUSPENDED | CREATE_NO_WINDOW, NULL, NULL, &startup, &process)) goto done;
    if (!AssignProcessToJobObject(job, process.hProcess)) { TerminateProcess(process.hProcess, 1); CloseHandle(process.hThread); CloseHandle(process.hProcess); goto done; }
    if (ResumeThread(process.hThread) == (DWORD)-1) { TerminateProcess(process.hProcess, 1); CloseHandle(process.hThread); CloseHandle(process.hProcess); goto done; }
    CloseHandle(process.hThread);
    thread = CreateThread(NULL, 0, wait_parent, NULL, 0, NULL);
    if (thread) {
        HANDLE handles[2]; handles[0] = process.hProcess; handles[1] = thread;
        waited = WaitForMultipleObjects(2, handles, FALSE, INFINITE);
        if (waited == WAIT_OBJECT_0 || waited == WAIT_OBJECT_0 + 1) exit_code = 0;
    }
    /* Closing the last job handle kills QEMU, including its child processes. */
    CloseHandle(job); job = NULL;
    if (WaitForSingleObject(process.hProcess, 10000) == WAIT_OBJECT_0) cleanup_disk(argv[1]);
    CloseHandle(process.hProcess);
 done:
    if (thread) CloseHandle(thread);
    if (job) CloseHandle(job);
    free(command);
    return exit_code;
}
