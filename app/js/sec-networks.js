/* Раздел: LAN и Wi-Fi (рабочая + гостевая) */
section({
  id: 'networks',
  icon: '📶',
  title: 'LAN и Wi-Fi сети',
  badge: 'шаг 2',
  lead: 'Создадим локальную сеть с пулом адресов, DHCP-сервером и две беспроводные сети: рабочую и гостевую ' +
        'с полной изоляцией гостей от внутренних ресурсов.',
  steps: [
    { t: 'Мост LAN и адресация', b: [
      P('Все LAN-порты объединяются в **bridge-lan** — к нему привязывается IP роутера (шлюз для клиентов).'),
      IMG('assets/img/bridge-lan.svg', 'WinBox: Bridge → Ports — порты ether2…ether5 объединены в bridge-lan'),
      CMD(
`# 1) Переименование портов (ether1 — WAN, остальные — LAN):
/interface ethernet set [ find default-name=ether1 ] name=ether1 comment="WAN"
/interface ethernet set [ find default-name=ether2 ] name=ether2 comment="LAN"

# 2) Мост и добавление LAN-портов:
/interface bridge add name=bridge-lan comment="Локальная сеть"
/interface bridge port add bridge=bridge-lan interface=ether2
/interface bridge port add bridge=bridge-lan interface=ether3
/interface bridge port add bridge=bridge-lan interface=ether4
/interface bridge port add bridge=bridge-lan interface=ether5

# 3) IP-адрес роутера = шлюз LAN:
/ip address add address=192.168.88.1/24 interface=bridge-lan comment="LAN"`,
        'Мост bridge-lan и шлюз'),
      P('Адресная сеть выбирается **один раз** и дальше не меняется без миграции: `192.168.88.0/24` (диапазон 192.168.88.0–192.168.88.255, usable 192.168.88.2–254).'),
      TIP('Если в сети уже есть чужой роутер с 192.168.88.0/24 — смените свою подсеть заранее, например на 192.168.10.0/24, чтобы не было конфликтов.')
    ]},

    { t: 'Пул адресов и DHCP-сервер', b: [
      P('DHCP раздаёт клиентам адреса из заданного **пула**, шлюз и DNS автоматически.'),
      IMG('assets/img/ip-pool.svg', 'WinBox: IP → Pool — диапазон адресов для раздачи (напр. 192.168.88.10–192.168.88.250)'),
      IMG('assets/img/dhcp-server.svg', 'WinBox: DHCP Setup / список серверов — интерфейс bridge-lan, пул pool-lan'),
      CMD(
`# Пул адресов (10…250 — оставляем резерв под статику 1–9 и 251–254):
/ip pool add name=pool-lan ranges=192.168.88.10-192.168.88.250

# Сеть для клиентов (шлюз и DNS):
/ip dhcp-server network add \\
    address=192.168.88.0/24 \\
    gateway=192.168.88.1 \\
    dns-server=77.88.8.8,8.8.8.8 \\
    comment="LAN"

# Сам DHCP-сервер:
/ip dhcp-server add \\
    name=dhcp-lan interface=bridge-lan \\
    address-pool=pool-lan lease-time=10m disabled=no

# Статические адреса внутри DHCP (например, сервер 1С):
/ip dhcp-server lease add address=192.168.88.10 mac-address=AA:BB:CC:DD:EE:FF server=dhcp-lan`,
        'Пул и DHCP-сервер LAN'),
      UL([
        '**Lease time** 10m–1d: короткое — быстрее отдаёт освободившийся адрес, длиннее — меньше трафика;',
        '**Статика** — лучше по MAC-адресу в DHCP-lease, чтобы адрес не «уезжал»;',
        'Проверка выдач: `/ip dhcp-server lease print`.'
      ]),
      WARN('Название сети в `dhcp-server network` должно совпадать с подсетью IP роутера. Пул **не должен** содержать адрес самого роутера (192.168.88.1).')
    ]},

    { t: 'Рабочая Wi-Fi-сеть', b: [
      P('Задача: надёжное шифрование WPA2/WPA3, один SSID на всех точках, канал без помех.'),
      IMG('assets/img/wifi-work.svg', 'WinBox: настройки Wi-Fi (v7 wifiwave2) — SSID рабочей сети, профиль безопасности WPA2'),
      CMD(
`# Страна (обязательно для корректной работы радио):
/interface wifi config set country=BY

# Профиль безопасности рабочей сети:
/interface wifi security profiles add name=sec-work \\
    mode=wpa2 wpa2-pre-shared-key="ВашНадежныйПароль1!"

# Точка доступа на мосту LAN:
/interface wifi configuration add name=cfg-work \\
    ssid="MyNet" security=sec-work \\
    mode-ap bridge=bridge-lan disabled=no`,
        'Wi-Fi v7 (wifiwave2: hAP ax, ax², cCR2004 и др.)'),
      P('Если роутер со **старым** Wireless (hAP ac², hEX, rb9xx и подобные — пакет `wireless`, не `wifiwave2`):'),
      CMD(
`/interface wireless security-profiles add name=sec-work \\
    authentication-types=wpa2-psk wpa2-pre-shared-key="ВашНадежныйПароль1!" \\
    mode=dynamic-keys

/interface wireless set [ find default-name=wlan1 ] \\
    disabled=no ssid="MyNet" \\
    security-profile=sec-work \\
    mode=ap bridge=bridge-lan \\
    channel=20/40mhz-Ce frequency=auto`,
        'Классический Wireless'),
      UL([
        '**Пароль** — 12+ символов, смешанный: WPA2-AES минимум, WPA3 где поддерживают клиенты;',
        '**Канал**: 2.4 ГГц — 1/6/11 (автовыбор), 5 ГГц — широкие 40/80 МГц, но короче радиус;',
        '**SSID лучше не прятать** (скрытый — проблемы у клиентов, трафик всё равно открыт в воздухе);',
        'Для офисов: отдельный VLAN для Wi-Fi через `/interface bridge add name=bridge-lan vlan-filtering=yes`.'
      ])
    ]},

    { t: 'Гостевая Wi-Fi-сеть (изолированная)', b: [
      P('Гости получают адреса из **своей подсети** и ходят **только в интернет**. До корпоративных ресурсов — доступ закрыт правилами firewall (раздел Firewall).'),
      IMG('assets/img/wifi-guest.svg', 'WinBox: гостевая сеть — отдельный SSID, привязка к bridge-guest, свой профиль безопасности'),
      CMD(
`# 1) Отдельный мост под гостей:
/interface bridge add name=bridge-guest comment="Гостевая сеть"
# (при необходимости добавьте в него порт: /interface bridge port add bridge=bridge-guest interface=ether5)

# 2) Адрес и пул гостей — своя подсеть!:
/ip address add address=192.168.99.1/24 interface=bridge-guest comment="Гости"
/ip pool add name=pool-guest ranges=192.168.99.10-192.168.99.250
/ip dhcp-server add name=dhcp-guest interface=bridge-guest \\
    address-pool=pool-guest lease-time=10m disabled=no
/ip dhcp-server network add address=192.168.99.0/24 \\
    gateway=192.168.99.1 dns-server=77.88.8.8 comment="Гости"

# 3) Гостевой Wi-Fi (v7):
/interface wifi security profiles add name=sec-guest \\
    mode=wpa2 wpa2-pre-shared-key="Gost2026!Net"
/interface wifi configuration add name=cfg-guest \\
    ssid="MyNet-Guest" security=sec-guest \\
    mode-ap bridge=bridge-guest disabled=no

# 4) Ограничение полосы для гостей (опционально):
/queue simple add name=guest-limit max-limit=20M/20M \\
    target=192.168.99.0/24 comment="Гостям не более 20 Мбит"`,
        'Гостевой сегмент'),
      P('Гости **не должны** попадать в LAN — изоляция делается в разделе Firewall (правила «Гости → LAN: запрет»).'),
      TIP('Если гостям нужен доступ к принтеру/IP-камере — разрешите конкретные адреса: `dst-address=192.168.88.10 protocol=tcp dst-port=631 action=accept` вместо общего запрета.')
    ]},

    { t: 'Hotspot (каптив-портал) для гостей — по желанию', b: [
      P('Вместо простого пароля можно показывать страницу входа с правилами. Быстрый старт через мастер:'),
      CMD(
`# WinBox: IP → Hotspot → Hotspot Setup → выбрать bridge-guest,
# пул, адрес страницы (обычно 192.168.99.1), логины. Мастер создаст всё сам.

# Ручной эквивалент ключевых объектов:
/ip hotspot profile add name=hs-guest hotspot-interface=bridge-guest \\
    html-directory=hotspot login-by=http-pap,mac-cookie
/ip hotspot user add name=guest password=temporary123 profile=hs-guest`,
        'Hotspot для гостей'),
      NOTE('Hotspot работает на уровне своего сервера — правила изоляции LAN из раздела Firewall продолжают действовать.')
    ]},

    { t: 'Проверка LAN/Wi-Fi', b: [
      OL([
        'Клиент получает адрес из правильного пула: `/ip dhcp-server lease print`.',
        'Шлюз пингуется с клиента: `ping 192.168.88.1`.',
        'Оба SSID видны и подключаются (рабочий → в LAN, гостевой → в 192.168.99.0/24).',
        'Клиент гостевой сети видит адрес вида 192.168.99.x (проверка `ipconfig /all` / `ip addr`).',
        'С гостевого устройства **не открывается** ресурс 192.168.88.x (до настройки firewall это ожидаемо после правил изоляции).'
      ]),
      CMD(
`/interface print
/ip address print
/ip dhcp-server lease print
/queue simple print`,
        'Проверка состояния')
    ]}
  ]
});
