/* Раздел: Первоначальная настройка — подключение провайдера */
section({
  id: 'initial',
  icon: '🔌',
  title: 'Подключение провайдера',
  badge: 'шаг 1',
  lead: 'Три способа подключить интернет: PPPoE с логином/паролем, DHCP «авто» и USB 3G/LTE-модем. ' +
        'Выберите тот, что прописан в вашем договоре — и выполняйте шаги по порядку.',
  steps: [
    { t: 'Определите тип подключения от провайдера', b: [
      TBL(['Тип в договоре', 'Что делаем в RouterOS', 'Раздел ниже'], [
        ['PPPoE (логин/пароль)', 'Создаём `pppoe-client`, вводим логин/пароль', 'Шаг 2'],
        ['DHCP («получает адрес автоматически»)', 'Создаём/включаем `dhcp-client` на WAN-порте', 'Шаг 3'],
        ['Статический IP (адрес/маска/шлюз)', 'Задаём IP на интерфейс + маршрут по умолчанию', 'Шаг 4'],
        ['USB 3G/LTE-модем', 'Настраиваем APN на `/interface lte`', 'Шаг 5']
      ]),
      NOTE('WAN-порт — обычно **ether1** (или отдельный порт, помеченный на корпусе). В остальных примерах WAN = ether1, LAN = ether2…ether5.')
    ]},

    { t: 'PPPoE: подключение по логину и паролю', b: [
      P('Самый частый вариант домашних провайдеров. Откройте **WinBox → Interfaces → + → PPPoE Client** (или терминал):'),
      IMG('assets/img/official/pppoe-general.png', 'WinBox: создание PPPoE-клиента и выбор интерфейса. Пример MikroTik.'),
      IMG('assets/img/official/pppoe-dial.png', 'WinBox: вкладка Dial Out для параметров PPPoE. Значения являются примером.'),
      CMD(
`# Интерфейсы сначала приводим к порядку (см. раздел «LAN»):
/interface ethernet set [ find default-name=ether1 ] name=ether1 comment="WAN"

/interface pppoe-client add \\
    name=pppoe-out1 interface=ether1 \\
    user="LOGIN_PPPOE" password="PASSWORD_PPPOE" \\
    add-default-route=no \\
    allow=pap,chap,mschapv2,mschap1 \\
    max-mru=1480 max-mtu=1480 \\
    disabled=no comment="WAN: провайдер"`,
        'PPPoE-клиент (маршрут по умолчанию добавим сами — важно для резервного канала)'),
      P('Ключевые поля:'),
      UL([
        '**Service** — оставьте пустым (любой) или укажите имя сервиса, если требует провайдер;',
        '**User / Password** — данные из договора;',
        '**Add Default Route** — поставьте `no`: маршрут по умолчанию мы зададим вручную с distance (нужно для failover). Можно `yes distance=1` если резерва не будет;',
        '**Use Peer DNS = yes** — DNS провайдера подтянется автоматически.'
      ]),
      CMD(
`# Статус сессии и IP:
/interface pppoe-client monitor pppoe-out1 once
/interface print detail where name=pppoe-out1
/ip address print where interface=pppoe-out1

# Проверка выхода в интернет:
ping 8.8.8.8`,
        'Проверка PPPoE'),
      NOTE('Сессия «Connecting…» часами — проверьте кабель в WAN, логин/пароль, VLAN провайдера (если нужен vlan — добавьте `add-default-route=no` после создания `vlan`-интерфейса и укажите его в клиенте).'),
      WARN('Если в договоре указан **VLAN** (часто у кабельных: vlan=10 и т.п.), сначала создайте `/interface vlan add name=vlan10 interface=ether1 vlan-id=10`, а PPPoE-клиент навесьте на `vlan10`.')
    ]},

    { t: 'DHCP: подключение «автоматически»', b: [
      P('Провайдер выдаёт адрес автоматически: DHCP-клиент должен работать на WAN-порту. Не путайте его с DHCP-сервером, который раздаёт адреса вашей LAN.'),
      WARN('Сначала проверьте IP → DHCP Client: на заводской конфигурации клиент уже может существовать на WAN. Измените существующую запись, не создавайте дубликат. Перед изменениями сохраните резервную копию и доступ через LAN.'),
      OL([
        'Откройте IP → DHCP Client. Нажмите + (WinBox 3) или New (WinBox 4), если нужного клиента ещё нет.',
        'На вкладке DHCP выберите подключённый к провайдеру порт. Для примера это ether1; в вашей схеме порт может отличаться.',
        'Для основного канала включите Add Default Route и задайте Default Route Distance = 1; резерву обычно назначают distance = 2. В некоторых версиях дополнительные параметры находятся на вкладке Advanced.',
        'В лабораторном проекте выключите Use Peer DNS: DNS указывается отдельно в IP → DNS. На снимках эта галочка включена — не копируйте настройки с изображения. Нажмите OK.',
        'Проверьте Status = bound и полученный IP Address в DHCP Client, а также динамический адрес в IP → Addresses. Адреса на снимках являются примерами.',
        'Проверьте в IP → Routes динамический маршрут 0.0.0.0/0. При двух каналах резервный маршрут может быть неактивным, пока работает основной.'
      ]),
      IMG('assets/img/examples/dhcp-client-create-winbox3.png', 'WinBox 3: создание DHCP-клиента. На снимке Use Peer DNS включён; в лабораторном проекте выключите его.'),
      IMG('assets/img/examples/dhcp-client-create-winbox4.png', 'WinBox 4: выбор WAN и создание клиента. Имена и значения на снимке — пример.'),
      IMG('assets/img/examples/dhcp-client-bound-winbox3.png', 'WinBox 3: status bound и динамический адрес WAN в IP → Addresses.'),
      IMG('assets/img/examples/dhcp-client-bound-winbox4.png', 'WinBox 4: проверка полученного адреса WAN. Чужой адрес и интерфейс не копируйте.'),
      P('Чтобы правила WAN действовали на этот интерфейс, добавьте порт в Interfaces → Interface List → Members: List = WAN, Interface = ether1. Если запись существует, повторно не создавайте.'),
      IMG('assets/img/official/interface-list-member.png', 'Пример MikroTik: добавление в список. На снимке выбран LAN и bridge1; для WAN выберите WAN и свой WAN-интерфейс.'),
      CMD(`# Пример для чистой конфигурации; убедитесь, что записи на ether1 ещё нет
/ip dns set servers=1.1.1.1,8.8.8.8
/ip dhcp-client add interface=ether1 add-default-route=yes default-route-distance=1 use-peer-dns=no disabled=no
/ip dhcp-client print detail
/ip address print where interface=ether1
/ip route print where dst-address=0.0.0.0/0`, 'DHCP-клиент и проверка'),
      TIP('Если status остаётся searching, проверьте кабель, выбранный WAN-порт, наличие DHCP у провайдера и необходимость VLAN. Работа DNS и доступность интернета проверяются отдельно. Не фиксируйте динамический шлюз в статическом маршруте без плана его обновления.')
    ]},

    { t: 'Статический IP от провайдера', b: [
      P('В договоре даны: адрес роутера, маска/префикс и шлюз. Пример для `203.0.113.2/30`, шлюз `203.0.113.1`:'),
      CMD(
`/interface ethernet set [ find default-name=ether1 ] name=ether-wan1

/ip address add address=203.0.113.2/30 interface=ether-wan1 comment="WAN: статика"

/ip dns set servers=203.0.113.1,77.88.8.8 allow-remote-requests=yes

# Маршрут по умолчанию (distance=1 — основной канал):
/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1 distance=1 \\
    check-gateway=ping comment="Default → провайдер"

ping 8.8.8.8`,
        'Статический адрес WAN'),
      WARN('Маска в интерфейсе и подсеть шлюза обязаны совпадать. Если написать /32, а шлюз «из другой подсети», роутер не сможет выйти наружу — классическая ошибка.')
    ]},

    { t: 'USB 3G / LTE-модем', b: [
      P('Вставьте SIM-карту и USB-модем в роутер. RouterOS подхватывает его как интерфейс `lte1` (модели с USB; проверьте `/interface lte print`).'),
      CMD(
`# Точка доступа оператора (узнайте у оператора, часто "internet"):
/interface lte apn add name=apn-main apn=internet use-network-apn=no

/interface lte set [ find default-name=lte1 ] \\
    apn=apn-main \\
    add-default-route=no \\
    disabled=no comment="WAN: LTE"

# Статус модема (режим, качество сигнала, IP):
/interface lte print
/interface lte monitor lte1 once`,
        'Настройка LTE'),
      P('Что смотреть в мониторе: `rsrp` (сильнее −80…−100 дБм), `sinr` (>0 нормально, >10 хорошо), `mode=LTE`/`LTE-A`. Плохая антенна → внешняя антенна SMA.'),
      UL([
        '**SIM с PIN** — сначала: `/interface lte set lte1 pin=1234` (иначе интерфейс не поднимется);',
        '**Роутеры без USB** — подойдёт любой USB-LTE через этот же роутер с USB-портом (hAP ax², RB4011, hex² и др.);',
        '**Если модем выдаёт PPP** — вместо `apn` используется настройка PPPoE-подобного подключения; в v7 обычно достаточно APN.'
      ]),
      CMD('# Проверка выхода через LTE:\nping 8.8.8.8 src-address=10.64.0.1', 'Если модем получил IP (см. /ip address print)')
    ]},

    { t: 'Финальная проверка подключения', b: [
      OL([
        'Сессия/интерфейс провайдера активен (`/interface print`, `status=bound` / `running`).',
        'У WAN появился IP (`/ip address print`).',
        'DNS настроены (`/ip dns print`).',
        'Есть маршрут по умолчанию (`/ip route print where dst-address=0.0.0.0/0`).',
        'С роутера пингуется интернет: `ping 8.8.8.8` и `ping google.com` (проверка DNS).'
      ]),
      CMD(
`/interface print
/ip address print
/ip route print where dst-address=0.0.0.0/0
/ip dns print
ping 8.8.8.8
ping google.com`,
        'Скрипт самопроверки подключения'),
      NOTE('Если пинг по IP есть, а по имени — нет: проблема в DNS (`/ip dns set servers=... allow-remote-requests=yes`). Если нет и IP — читайте замечания по своему типу подключения выше.'),
      TIP('Дальше обязательно настройте разделы «LAN и Wi-Fi», затем «Firewall»: без фильтра роутер с публичным IP уязвим.')
    ]}
  ]
});
