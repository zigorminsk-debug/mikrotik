# Собственные снимки учебного стенда

`chr-winbox4-workspace.png` — необрезанный снимок экрана, полученный на одноразовом GitHub Actions runner в виртуальной машине QEMU с официальным RouterOS CHR 7.23.8 (long-term) и WinBox 4.4 для Linux. В строке состояния WinBox видны CHR, версия RouterOS и адрес `127.0.0.1:18291`, проброшенный только на localhost runner. Это тестовое подключение, не реальное устройство пользователя. Виртуальный роутер без Wi-Fi и LTE, пользовательские данные и реальные пароли не использовались. Снимок показывает только главное окно после входа, не настройки отдельных функций.

Источник ПО: https://mikrotik.com/download и https://help.mikrotik.com/docs/spaces/ROS/pages/18350234/Cloud+Hosted+Router+CHR. Необрезанная копия была проверена визуально; файл предоставляется как снимок интерфейса ПО MikroTik, а не как нарисованный макет. Права на программный интерфейс принадлежат MikroTik.

`router-nat-windows.jpg` — собственный снимок интерфейса лаборатории приложения на одноразовом Windows GitHub Actions runner, [запуск 41072005065](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41072005065). Показаны демонстрационные настройки TCP 8443 → 443 и UDP 5353 → 53 для тестового сервера 192.168.88.10/24. Это окно приложения, не снимок WebFig и не доказательство доступности сервера.

`diagram-export-windows.jpg` — собственный снимок окна Windows Electron с кнопками сохранения PNG и GIF, GitHub Actions [41078825051](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41078825051). На нём показано только расположение кнопок, не диалог сохранения и не результат экспорта.

`interfaces-winbox4.jpg` — собственный снимок WinBox 4.4, подключённого к тестовой CHR 7.23.8 в QEMU на одноразовом GitHub runner, [запуск 41079535342](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41079535342). Показан список Interfaces → Interface; PPPoE-клиент отключён. Снимок не подтверждает подключение к провайдеру.

`ether1-winbox4.jpg` — собственный снимок окна свойств Ethernet-интерфейса ether1, вкладки General WinBox 4.4, подключённого к тестовой CHR 7.23.8 в QEMU на одноразовом GitHub runner, [запуск 41096267864](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41096267864). Это виртуальный интерфейс; статус link ok не подтверждает интернет.

`chr-network-warning.jpg` — собственный снимок настоящего системного предупреждения Windows, вызванного тестом Electron с теми же параметрами, что и в приложении, [GitHub Actions 41100165614](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41100165614), success. Для снимка CHR и интернет-сессия не запускались; кнопка отмены нажата автоматикой. Снимок проверен визуально, SHA-256 совпадает с файлом этого запуска.

`system-menu-winbox4.jpg` — необрезанный оригинальный снимок открытого меню System WinBox 4.4 на одноразовой CHR 7.23.8, [GitHub Actions 41116453028](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41116453028). Показан выбор Clock и NTP Client, не сама настройка и не синхронизация; проверен визуально.

`ntp-client-winbox4.jpg` и `clock-winbox4.jpg` — необрезанные оригинальные снимки NTP Client и Clock в WinBox 4.4 на одноразовой CHR 7.23.8, [GitHub Actions 41118327294](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41118327294), success. Параметры заданы в тестовой VM по serial: Europe/Minsk, NTP включён и сервер 192.0.2.123 (зарезервированный TEST-NET-1, не настоящий источник времени). Статус waiting не подтверждает синхронизацию. Оба снимка проверены визуально. Снимок показывает состояние полей, не нажатие Apply/OK.

`ntp-edit-winbox4.jpg` — оригинальный снимок формы NTP Client WinBox 4.4 на одноразовой CHR 7.23.8 ([GitHub Actions 41172459201](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41172459201)). Значения введены автоматикой в самом WinBox: Enabled, адрес TEST-NET-1 192.0.2.123; до нажатия Apply кнопка активна, прежний статус stopped. Снимок проверен визуально; он не свидетельствует о сохранении или синхронизации.
