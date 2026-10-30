/* Раздел: Firewall и NAT */
section({
  id: 'firewall',
  icon: '🛡️',
  title: 'Firewall и NAT',
  badge: 'шаг 3',
  lead: 'Защита роутера и сети (filter), выход в интернет (masquerade) и публикация внутренних сервисов ' +
        '(порт-форвардинг). Порядок правил — как в инструкции, сверху вниз.',
  steps: [
    { t: 'Как устроен firewall RouterOS', b: [
      P('Трафик проходит **цепочки**: `input` (к роутеру), `output` (от роутера), `forward` (сквозь роутер), а NAT — `srcnat`/`dstnat`.'),
      TBL(['Цепочка', 'Что за трафик', 'Наша политика'], [
        ['input', 'Подключение к самому роутеру (WinBox, DNS, ping)', 'Разрешить из LAN, **запретить из интернета**'],
        ['forward', 'Транзит LAN ⇄ интернет, публикации', 'Разрешить LAN→WAN и существующие, **запретить WAN→LAN**'],
        ['srcnat', 'Исходящий наружу (маскируем внутренние IP)', '**masquerade** на выходе в WAN'],
        ['dstnat', 'Входящий на внутренние серверы', 'Правила публикации конкретных портов']
      ]),
      WARN('В RouterOS правила проверяются **сверху вниз**, первое совпадение побеждает (action не `passthrough`). Добавляйте строго в указанном порядке!')
    ]},

    { t: 'Ограничение управляющих служб', b: [
      P('В лаборатории можно включить ограничение служб управления для одного MikroTik. Проект ограничивает WinBox и SSH подсетью основной IPv4 LAN, отключает Telnet, FTP, WebFig и API, а также MAC Telnet, MAC WinBox и MAC Ping. Обнаружение соседей остаётся на списке LAN.'),
      WARN('Выполняйте только после проверки IP-доступа из разрешённой сети. MAC-подключение и WebFig перестанут работать; подготовьте последовательную консоль или другой независимый способ восстановления. Правила firewall, VPN-доступ, IPv6 и работающие приложения необходимо проверить отдельно.'),
      OL([
        'В IP → Services откройте WinBox и SSH, установите Available From для вашей основной LAN. Другие управляющие службы отключайте только если они не нужны.',
        'В Tools → MAC Server установите для MAC Telnet и MAC WinBox список none, отключите MAC Ping.',
        'В IP → Neighbors → Discovery Settings выберите LAN. Убедитесь, что список LAN соответствует вашей сети.',
        'Переподключитесь по IP и проверьте, что нежелательные способы входа недоступны. Для восстановления используйте независимую консоль.'
      ]),
      CMD(`/ip service set [find name=winbox] address=192.168.88.0/24
/ip service set [find name=ssh] address=192.168.88.0/24
/ip service disable [find where name=telnet or name=ftp or name=www or name=www-ssl or name=api or name=api-ssl]
/tool mac-server set allowed-interface-list=none
/tool mac-server mac-winbox set allowed-interface-list=none
/tool mac-server ping set enabled=no
/ip neighbor discovery-settings set discover-interface-list=LAN`, 'Пример: настройка служб после проверки доступа'),
      NOTE('Снимка именно этого пункта пока нет. Официальные рекомендации: https://help.mikrotik.com/docs/spaces/ROS/pages/328353/Securing+your+router')
    ]},
    { t: 'Защита роутера: input', b: [
      P('Базовый набор: разрешаем уже открытые соединения и LAN, всё остальное — запрещаем.'),
      IMG('assets/img/official/firewall-menu.png', 'WinBox: открыть IP → Firewall и добавить правило. Пример MikroTik.'),
      IMG('assets/img/official/firewall-rule.png', 'WinBox: пример создания правила filter. Параметры на снимке — пример, сверяйте с инструкцией.'),
      CMD(
`/ip firewall filter
# --- input: трафик К роутеру ---
add chain=input connection-state=established,related action=accept comment="1. Существующие"
add chain=input connection-state=invalid action=drop comment="2. Невалидные — запрет"
add chain=input in-interface-list=WAN protocol=udp src-port=67 dst-port=68 action=accept comment="3. DHCP от провайдера"
add chain=input in-interface-list=WAN action=drop comment="4. Интернет → роутер: запрет"
add chain=input in-interface-list=LAN protocol=udp src-port=67 dst-port=68 action=drop comment="5. Чужой DHCP в LAN"
add chain=input in-interface-list=LAN action=accept comment="6. LAN → роутер: разрешить"
add chain=input action=drop comment="7. Всё прочее: запрет"`,
        'Правила input'),
      P('Что дал этот набор:'),
      UL([
        'WinBox/DNS из LAN работают (правило 6);',
        'Из интернета к роутеру не подключиться (правило 4): закрыты WinBox, WebFig, SSH, API;',
        'Клиентам LAN по-прежнему нужен DNS (роутер как резолвер) — он разрешён правилом 6;',
        'Невалидный и «чужой» трафик отсекается.'
      ]),
      NOTE('SSH/WinBox только с конкретной подсети: замените правило 6 на `in-interface-list=LAN src-address=192.168.88.0/24 action=accept` и не разрешайте всё подряд.')
    ]},

    { t: 'Защита транзита: forward', b: [
      P('Правила, сквозь которых идёт весь интернет-трафик. Главное: из интернета внутрь — только по явным разрешениям (публикации).'),
      CMD(
`/ip firewall filter
# --- forward: транзит ---
add chain=forward connection-state=established,related action=accept comment="F1. Существующие"
add chain=forward connection-state=invalid action=drop comment="F2. Невалидные"
add chain=forward in-interface=bridge-guest out-interface-list=LAN action=drop comment="F3. Гости → LAN: запрет"
# ... здесь будут ваши правила публикаций (см. шаг «Порт-форвардинг») ...
add chain=forward in-interface-list=LAN out-interface-list=WAN action=accept comment="F4. LAN → интернет"
add chain=forward in-interface=bridge-guest out-interface-list=WAN action=accept comment="F5. Гости → интернет"
add chain=forward in-interface-list=WAN action=drop comment="F6. Интернет → LAN: запрет"`,
        'Правила forward'),
      P('Порядок даёт: гостям — только наружу (F3/F5), всем из LAN — наружу (F4), из интернета внутрь — **никто**, кроме разрешённых публикаций (вставляются **перед** F6).'),
      TIP('Включите учёт трафика: к каждому правилу добавляется счётчик — смотрите **Firewall → Filter → Stats**, удобно для отладки.')
    ]},

    { t: 'NAT: выход в интернет (masquerade)', b: [
      P('Внутренние адреса 192.168.88.x провайдер не знает — маскируем исходящий трафик на WAN.'),
      CMD(
`/ip firewall nat add \\
    chain=srcnat out-interface-list=WAN \\
    action=masquerade comment="Выход в интернет"

# Проверьте, что список WAN собран (см. разделы 1–3):
/interface list print
/interface list member print`,
        'Правило masquerade'),
      UL([
        '**masquerade** — для динамических адресов (PPPoE/DHCP/LTE): переживает смену IP провайдера;',
        '**src-nat с to-addresses** — лучше для статических IP: стабильнее и быстрее маскарада;',
        'Если публикуете сервер, помните: внешним адресом будет IP провайдера (или настроенный IP из диапазона).'
      ]),
      NOTE('Два и более провайдера — одно правило `out-interface-list=WAN` покрывает оба выхода. Для публикаций важно: правило dstnat срабатывает **до** srcnat.')
    ]},

    { t: 'Порт-форвардинг: доступ из интернета к внутренним ресурсам', b: [
      P('Пример: открыть веб-сервер `192.168.88.10:443` наружу под портом `443` и NAS `192.168.88.20` под внешним `8443/tcp`:'),
      CMD(
`# 1) Само перенаправление (dstnat):
/ip firewall nat add chain=dstnat in-interface-list=WAN \\
    protocol=tcp dst-port=443 \\
    action=dst-nat to-addresses=192.168.88.10 to-ports=443 \\
    comment="Веб-сервер"

/ip firewall nat add chain=dstnat in-interface-list=WAN \\
    protocol=tcp dst-port=8443 \\
    action=dst-nat to-addresses=192.168.88.20 to-ports=443 \\
    comment="NAS"

# 2) Разрешающие правила forward — ОБЯЗАТЕЛЬНО (до "интернет → LAN: запрет"):
/ip firewall filter add chain=forward in-interface-list=WAN \\
    protocol=tcp dst-address=192.168.88.10 dst-port=443 \\
    connection-state=new action=accept comment="ПУБЛ: веб-сервер"

/ip firewall filter add chain=forward in-interface-list=WAN \\
    protocol=tcp dst-address=192.168.88.20 dst-port=443 \\
    connection-state=new action=accept comment="ПУБЛ: NAS"`,
        'dstnat + разрешающие правила'),
      P('Проверка снаружи (с телефона на мобильном интернете): откройте `https://ВАШ_ПУБЛИЧНЫЙ_IP:443`. Убедитесь, что внутренний сервис слушает **0.0.0.0**, а не только 127.0.0.1.'),
      UL([
        '**Не публикуйте** RDP/VNC/WinBox напрямую — только через VPN (раздел VPN) или jump-хост;',
        'Укажите конкретный провайдер в `in-interface=` (pppoe-out1), если ресурс должен открываться только через него;',
        'Проверьте порядок: dstnat-правило выполняется до правил маскарада, порт во внутренней сети может быть другим (`to-ports`).'
      ]),
      WARN('Публикация порта без правила filter-accept не сработает: трафик упадёт в F6 «Интернет → LAN: запрет». Держите разрешающее правило **выше** F6.')
    ]},

    { t: 'Публикация сервера в графической лаборатории', b: [
      P('Настройки доступа извне снова доступны прямо в окне настроек MikroTik, в разделе **NAT: доступ к ресурсам извне**. Они также сохраняются в настройках самого ПК или сервера: это одни и те же данные, а не два независимых правила.'),
      OL([
        'Добавьте MikroTik, провайдера и ПК или сервер. Подключите сервер к MikroTik напрямую либо через коммутатор первой сетевой картой.',
        'В настройках сервера укажите статический LAN-адрес вне DHCP-пула и соответствующий шлюз. Например, 192.168.88.20/24 и 192.168.88.1. Эти адреса являются учебными.',
        ACTION('Откройте ⚙ на MikroTik и прокрутите до «NAT: доступ к ресурсам извне». Найдите сервер, включите доступ, выберите TCP или UDP и укажите внешний порт и порт сервиса, например TCP 8443 → 443. При необходимости увеличьте количество правил и добавьте другие порты. Сохраните настройки.', IMG('assets/img/own/router-nat-windows.jpg', 'Снимок предыдущей версии окна Windows с одним правилом TCP 8443 → 443; количество правил в нём ещё не показано. Новый снимок готовится. Это окно приложения, не WebFig.')),
        'Запустите проверку схемы и просмотрите создаваемые правила dstnat и forward. Если порты конфликтуют, адрес не подходит или отсутствует подключение, исправьте ошибки перед продолжением.',
        'В Windows откройте совместимую изолированную CHR и проверьте правила в IP → Firewall → NAT и Filter. Приложение сверяет параметры правил, но сейчас не запускает виртуальный сервер и не проверяет подключение к нему.',
        'Перед внедрением проверьте адрес провайдера и CGNAT, защиту сервиса, firewall и подключение с отдельного внешнего клиента в контролируемом тесте. Подготовьте резервную копию и план отката; не переносите пример в продуктивную сеть без проверки.'
      ]),
      WARN('В текущем редакторе поддерживается до 16 правил TCP или UDP на ПК или сервер; при запуске CHR действует также общий лимит команд. Интернет не подключён к CHR, а правила не публикуют порт на Windows-хосте. Это не подтверждает работоспособность внешнего доступа и не является разрешением открывать административные службы в интернет.'),
      NOTE('Показан собственный снимок только окна настроек NAT; для остальных действий отдельные оригинальные снимки пока отсутствуют.')
    ]},

    { t: 'Дополнительная защита', b: [
      H('Блокировка по адресам (широкое сканирование)'),
      CMD(
`# Занести хосты в чёрный список:
/ip firewall address-list add list=blocked address=198.51.100.66 comment="сканер"

# Правило (перед F6, т.е. до общих accept — на входе из WAN):
/ip firewall filter add chain=input in-interface-list=WAN \\
    src-address-list=blocked action=drop comment="Блокировка списка"`,
        'address-list'),
      H('Лимит новых подключений (защита от перебора портов)'),
      CMD(
`/ip firewall filter add chain=input in-interface-list=WAN \\
    protocol=tcp dst-port=23,8291 connection-state=new \\
    src-address-list=ssh_blacklist action=drop

/ip firewall filter add chain=input in-interface-list=WAN \\
    protocol=tcp dst-port=23,8291 connection-state=new \\
    connection-limit=3/32,32 src-address-list=!ssh_blacklist \\
    action=add-src-to-address-list address-list=ssh_blacklist \\
    address-list-timeout=1h`,
        'Protection от брутфорса WinBox/SSH'),
      H('Разрешить ping WAN только при необходимости'),
      CMD('# Ответы на наши пинги уже разрешены (established). Внешний ping к роутеру обычно НЕ нужен:\n# /ip firewall filter add chain=input in-interface-list=WAN protocol=icmp action=accept  ← включайте осознанно'),
      P('Готовый набор проверяется в разделе «Проверка»: `/ip firewall filter print stats` — счётчики растут → правила работают.')
    ]},

    { t: 'Проверка firewall', b: [
      OL([
        'С LAN: WinBox подключается по MAC/192.168.88.1, `ping 8.8.8.8` работает.',
        'С WAN: попытка открыть WebFig/WinBox по публичному IP **не проходит** (проверка извне или через адрес-лист).',
        'Публикация отвечает снаружи; счётчик соответствующего правила растёт (`/ip firewall filter print stats`).',
        'С гостевого SSID открывается интернет, но 192.168.88.x — недоступны.',
        'Строка `NAT` увеличивает `bytes` у клиентов: `/ip firewall nat print stats`.'
      ]),
      CMD(
`/ip firewall filter print stats
/ip firewall nat print stats
/ip firewall address-list print`,
        'Счётчики правил')
    ]}
  ]
});
