# Собственные снимки учебного стенда

`chr-winbox4-workspace.png` — необрезанный снимок экрана, полученный на одноразовом GitHub Actions runner в виртуальной машине QEMU с официальным RouterOS CHR 7.23.8 (long-term) и WinBox 4.4 для Linux. В строке состояния WinBox видны CHR, версия RouterOS и адрес `127.0.0.1:18291`, проброшенный только на localhost runner. Это тестовое подключение, не реальное устройство пользователя. Виртуальный роутер без Wi-Fi и LTE, пользовательские данные и реальные пароли не использовались. Снимок показывает только главное окно после входа, не настройки отдельных функций.

Источник ПО: https://mikrotik.com/download и https://help.mikrotik.com/docs/spaces/ROS/pages/18350234/Cloud+Hosted+Router+CHR. Необрезанная копия была проверена визуально; файл предоставляется как снимок интерфейса ПО MikroTik, а не как нарисованный макет. Права на программный интерфейс принадлежат MikroTik.

`router-nat-windows.jpg` — собственный снимок интерфейса лаборатории приложения на одноразовом Windows GitHub Actions runner, [запуск 41072005065](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41072005065). Показаны демонстрационные настройки TCP 8443 → 443 и UDP 5353 → 53 для тестового сервера 192.168.88.10/24. Это окно приложения, не снимок WebFig и не доказательство доступности сервера.

`diagram-export-windows.jpg` — собственный снимок окна Windows Electron с кнопками сохранения PNG и GIF, GitHub Actions [41078825051](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41078825051). На нём показано только расположение кнопок, не диалог сохранения и не результат экспорта.

`interfaces-winbox4.jpg` — собственный снимок WinBox 4.4, подключённого к тестовой CHR 7.23.8 в QEMU на одноразовом GitHub runner, [запуск 41079535342](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41079535342). Показан список Interfaces → Interface; PPPoE-клиент отключён. Снимок не подтверждает подключение к провайдеру.

`ether1-winbox4.jpg` — собственный снимок окна свойств Ethernet-интерфейса ether1, вкладки General WinBox 4.4, подключённого к тестовой CHR 7.23.8 в QEMU на одноразовом GitHub runner, [запуск 41096267864](https://github.com/zigorminsk-debug/mikrotik/actions/runs/41096267864). Это виртуальный интерфейс; статус link ok не подтверждает интернет.
