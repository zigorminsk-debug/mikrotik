/* Раздел: прямое подключение к физическому MikroTik (RouterOS API). */
section({
  id: 'connect',
  icon: '🔌',
  type: 'connect',
  title: 'Прямое подключение к MikroTik',
  lead: 'Работа с реальным роутером RouterOS по API (порт 8728) или API-SSL (порт 8729):\nкоманды в консоли, применение сгенерированной стендом конфигурации.',
  steps: [
    { t: 'Подключение: какой тип канала', b: [
      P('Выберите тип подключения к провайдеру — от этого зависит настройка интерфейса WAN:'),
      UL([
        '**PPPoE** — логин/пароль от провайдера (обычно для DSL/GPON);',
        '**DHCP** — адрес выдаётся автоматически (кабельный интернет, Ethernet);',
        '**Статический IP** — фиксированный адрес, маска, шлюз от провайдера;',
        '**USB 3G/LTE** — сотовый канал через USB-модем (резерв или основной).'
      ]),
      NOTE('На стенде выбирайте тип провайдера — приложение сгенерирует соответствующие команды RouterOS.')
    ]},

    { t: 'PPPoE-клиент (логин/пароль)', b: [
      IMG('assets/img/pppoe-client.svg', 'WinBox: Interfaces → PPPoE Client — настройка логина/пароля'),
      CMD(`/interface pppoe-client add \
    name=pppoe-out1 \
    interface=ether1 \
    user=\"логин-провайдера\" \
    password=\"пароль-провайдера\" \
    add-default-route=no \
    disabled=no`),
      P('`add-default-route=no` — важно для failover: маршрут по умолчанию зададите вручную с нужным distance (см. «Резервный канал»).')
    ]},

    { t: 'DHCP-клиент (авто-адрес)', b: [
      IMG('assets/img/dhcp-client.svg', 'WinBox: DHCP Client — привязка к интерфейсу и статус получения адреса'),
      CMD(`/ip dhcp-client add \
    interface=ether2 \
    add-default-route=no \
    use-peer-dns=yes \
    disabled=no`),
      P('После получения адреса проверьте: `/ip dhcp-client print` — статус должен быть `bound`.')
    ]},

    { t: 'Статический IP', b: [
      CMD(`/ip address add address=203.0.113.10/24 interface=ether1 comment=\"WAN провайдера\"`),
      CMD(`/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1 distance=1 comment=\"WAN шлюз\"`),
      P('Затем настройте masquerade для NAT (см. «Firewall и NAT») и DNS (`/ip dns set servers=77.88.8.8 allow-remote-requests=yes`).')
    ]},

    { t: 'Подключение к роутеру из приложения', b: [
      P('В разделе **«Прямое подключение к MikroTik»** выберите цель **«Реальный роутер»**:'),
      OL([
        'Укажите хост/IP роутера, порт (8728 для API, 8729 для API-SSL), пользователя и пароль.',
        'Нажмите **«Подключиться»** — приложение установит TCP-соединение и выполнит логин по RouterOS API.',
        'В консоли вводите команды (`/ip address print`, `/ip firewall filter print` и др.).',
        'После моделирования на стенде нажмите **«Отправить сгенерированную конфигурацию на роутер»** — все команды применятся по порядку.'
      ]),
      WARN('Перед первым подключением на роутере включите службу API: `/ip service enable api` (для API-SSL — также `api-ssl`).')
    ]}
  ]
});
