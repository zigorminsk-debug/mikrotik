/* Раздел: Первоначальная настройка — подключение провайдера */
section({
  id: 'initial',
  icon: '🔌',
  title: 'Подключение провайдера',
  badge: 'шаг 1',
  lead: 'Подключение интернета: PPPoE, DHCP, статический адрес или совместимый LTE/5G-модем. ' +
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
      P('Для PPPoE нужны порт провайдера и учётные данные. В WinBox откройте Interfaces → + → PPPoE Client или PPP → Interface → + → PPPoE Client; названия зависят от версии WinBox.'),
      WARN('Проверьте существующих PPPoE-клиентов и маршруты: не создавайте дубликат. Для выхода LAN нужны отдельные правила NAT и firewall; WAN-список должен включать используемый PPPoE-интерфейс.'),
      IMG('assets/img/official/pppoe-general.png', 'WinBox: создание PPPoE-клиента и выбор интерфейса. Пример MikroTik.'),
      IMG('assets/img/official/pppoe-dial.png', 'WinBox: вкладка Dial Out для параметров PPPoE. Значения являются примером.'),
      CMD(
`# Интерфейсы сначала приводим к порядку (см. раздел «LAN»):
/interface ethernet set [ find default-name=ether1 ] name=ether1 comment="WAN"

/interface pppoe-client add \\
    name=pppoe-out1 interface=ether1 \\
    user="LOGIN_PPPOE" password="PASSWORD_PPPOE" \\
    add-default-route=yes default-route-distance=1 use-peer-dns=no \\
    disabled=no comment="WAN: провайдер"`,
        'PPPoE-клиент: один основной канал'),
      P('Ключевые поля:'),
      UL([
        '**Service** — оставьте пустым (любой) или укажите имя сервиса, если требует провайдер;',
        '**User / Password** — данные из договора;',
        '**Add Default Route** — создаёт маршрут по умолчанию; для основного канала обычно задают Distance = 1, для резервного — больше. Это не гарантирует обнаружение обрыва интернета за работающим провайдером;',
        '**Use Peer DNS** — принимает DNS от провайдера, если включён. В этом примере `no`: укажите DNS отдельно в IP → DNS.'
      ]),
      CMD(
`# Статус сессии и IP:
/interface pppoe-client monitor pppoe-out1 once
/interface print detail where name=pppoe-out1
/ip address print where interface=pppoe-out1

# Проверка выхода в интернет:
ping 8.8.8.8`,
        'Проверка PPPoE'),
      NOTE('Если сессия долго не подключается, проверьте кабель, выбранный WAN, учётные данные и VLAN провайдера. При резервировании отдельно проверьте мониторинг доступности и существующие маршруты.'),
      WARN('Если в договоре указан **VLAN** (часто у кабельных: vlan=10 и т.п.), сначала создайте `/interface vlan add name=vlan10 interface=ether1 vlan-id=10`, а PPPoE-клиент навесьте на `vlan10`.')
    ]},

    { t: 'DHCP: подключение «автоматически»', b: [
      P('Провайдер выдаёт адрес автоматически: DHCP-клиент должен работать на WAN-порту. Не путайте его с DHCP-сервером, который раздаёт адреса вашей LAN.'),
      WARN('Сначала проверьте IP → DHCP Client: на заводской конфигурации клиент уже может существовать на WAN. Измените существующую запись, не создавайте дубликат. Перед изменениями сохраните резервную копию и доступ через LAN.'),
      OL([
        ACTION('В WinBox 4 откройте меню IP. В списке найдите DHCP Client: это клиент для получения адреса, а не DHCP Server для выдачи адресов локальным устройствам.', IMG('assets/img/own/ip-menu-winbox4.jpg', 'Оригинальный WinBox 4.4 на одноразовой CHR 7.23.8: открыто меню IP, видны отдельные пункты DHCP Client и DHCP Server. Настройки в этом действии не менялись.')),
        ACTION('Выберите DHCP Client и проверьте, нет ли уже клиента на нужном WAN-интерфейсе. На снимке тестовой CHR запись на ether1 уже есть; она получила адрес от виртуального NAT QEMU, а не от физического провайдера.', IMG('assets/img/own/dhcp-client-list-winbox4.jpg', 'Оригинальный WinBox 4.4 на тестовой CHR: client1 на ether1, адрес 10.0.2.15/24, Status bound. Use Peer DNS и Add Default Route включены в этом тесте. Доступность интернета не проверена.')),
        'Если нужного клиента нет, нажмите New в WinBox 4; иначе откройте существующую запись и не создавайте дубликат. Снимка формы создания пока нет.',
        'На вкладке DHCP выберите подключённый к провайдеру порт. Для примера это ether1; в вашей схеме порт может отличаться.',
        'Для основного канала включите Add Default Route и задайте Default Route Distance = 1; резерву обычно назначают distance = 2. В некоторых версиях дополнительные параметры находятся на вкладке Advanced.',
        'В лабораторном проекте выключите Use Peer DNS: DNS указывается отдельно в IP → DNS. Нажмите OK.',
        ACTION('Проверьте Status = bound и полученный IP Address в DHCP Client. На снимке виден только тестовый адрес виртуальной сети; отдельно проверьте адрес в IP → Addresses и доступность нужных служб.', IMG('assets/img/own/dhcp-client-list-winbox4.jpg', 'Тот же оригинальный снимок тестовой CHR: Status bound означает полученную аренду, но не доказывает подключение к физическому провайдеру или интернету.')),
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
      WARN('Для обычной Ethernet-сети проверьте префикс адреса и достижимость шлюза по данным провайдера. Схемы с /32 и шлюзом вне префикса возможны, но требуют отдельной настройки и не покрываются этим примером.')
    ]},

    { t: 'LTE/5G: совместимый модем и APN', b: [
      P('Сотовый интерфейс и его параметры зависят от модели роутера, модема, пакета, прошивки и RouterOS. Используйте SIM и APN оператора; LTE-интерфейс не обязательно называется lte1. CHR не имитирует реальный модем.'),
      WARN('До изменений проверьте поддержку устройства, тариф, роуминг, PIN и резервный способ управления. Не включайте roaming без согласования с оператором. Собственных снимков реального LTE-модема пока нет.'),
      P('В примере ниже профиль маршрута указан внутри APN. Для RouterOS 7.26 используется `apn-profile`; в более ранних выпусках может использоваться `apn-profiles`. Уточните синтаксис на вашей версии перед применением.'),
      CMD(`# RouterOS 7.26: пример для существующего интерфейса lte1
/interface lte print detail
/interface lte apn add name=apn-main apn=internet use-network-apn=no add-default-route=yes default-route-distance=1 use-peer-dns=no
/interface lte set [find where name=lte1] apn-profile=apn-main
/interface lte monitor lte1 once
/ip route print where dst-address=0.0.0.0/0`, 'LTE: пример APN и проверка'),
      P('Замените APN на значение оператора, проверьте режим, регистрацию в сети, адрес и маршрут. Если оператор выдал логин или пароль APN, задайте соответствующую аутентификацию в профиле. DNS при use-peer-dns=no настройте отдельно.'),
      TIP('Официальное описание параметров и условий поддержки: https://manual.mikrotik.com/docs/mobile-networking/lte-5g/')
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
