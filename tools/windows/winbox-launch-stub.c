/* CI-only executable named WinBox.exe. Writes a marker, makes no network calls. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
int wmain(int argc,wchar_t **argv) {
    wchar_t path[32768]; DWORD n=GetEnvironmentVariableW(L"WB_CI_MARKER",path,32768), written=0;
    (void)argv;
    if(!n||n>=32768)return 2;
    HANDLE f=CreateFileW(path,GENERIC_WRITE,0,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,NULL);
    if(f==INVALID_HANDLE_VALUE)return 3;
    const char *result=argc==1?"no-arguments":"unexpected-arguments";
    BOOL ok=WriteFile(f,result,(DWORD)lstrlenA(result),&written,NULL);
    CloseHandle(f);
    return ok?0:4;
}
