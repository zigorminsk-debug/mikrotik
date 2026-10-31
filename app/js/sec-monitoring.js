/* Раздел: Мониторинг и диагностика RouterOS. */
section({
  id: 'monitoring',
  icon: '📊',
  title: 'Мониторинг и диагностика',
  badge: 'новое',
  lead: 'Как следить за состоянием роутера: каналы, трафик, логи, оповещения и графики нагрузки.',
  steps: [
    { t: 'Netwatch: контроль доступности каналов', b: [
      P('Netwatch пингует указанные хосты и при потере/восстановлении связи выполняет скрипты. Идеально для резервного канала:'),
      IMG('assets/img/netwatch.svg', 'WinBox: Tools → Netwatch — список хостов, статус up/down, скрипты'),
      CMD(`# Проверка основного канала (Google DNS):
/tool netwatch add \
    host=8.8.8.8 \
    type=icmp \
    interval=10s \
    timeout=1s \
    comment="Основной канал"

# Пример скриптов (настроить под себя):
# down-script=:log warning "КАНАЛ ДАУН — проверьте провайдера"
# up-script=:log info "Канал восстановлен"`,
        'Настройка Netwatch'),
      TIP('Статус можно смотреть в WinBox → Tools → Netwatch, а историю событий — в /log print where topics~"netwatch".')
    ]},

    { t: 'Torch: смотрим, кто грузит канал прямо сейчас', b: [
      P('Torch показывает реальный трафик по интерфейсу — кто и с каким объёмом передаёт. Полезно для поиска «пожирателя» канала:'),
      IMG('assets/img/monitor-torch.svg', 'WinBox: Tools → Torch — мониторинг трафика в реальном времени'),
      CMD(`# Мониторинг трафика на WAN-интерфейсе:
/tool torch interface=pppoe-out1 \
    protocol=all \
    src-address=0.0.0.0/0 \
    dst-address=0.0.0.0/0

# Или быстрый мониторинг через терминал:
/interface monitor-traffic ether1 once`,
        'Torch и мониторинг трафика'),
      NOTE('Torch потребляет ресурсы процессора — не оставляйте его включённым постоянно на слабых роутерах.')
    ]},

    { t: 'Логи и системные события', b: [
      P('Все важные события пишутся в системный журнал. Просмотр и фильтрация:'),
      CMD(`# Последние записи лога:
/log print

# Только ошибки:
/log print where error

# События Netwatch:
/log print where topics~"netwatch"

# Очистка лога (если разрастается):
/log clear`,
        'Работа с логами'),
      TIP('В логах отражаются подключения PPP, ошибки firewall, сбои интерфейсов и результаты check-gateway — первое место для диагностики.')
    ]},

    { t: 'Графики нагрузки (Graphing)', b: [
      P('RouterOS может строить графики загрузки интерфейсов, CPU, памяти и диска — helpful для оценки, достаточно ли роутеру мощности:'),
      CMD(`# Включаем сбор статистики:
/tool graphing set store-every=5m \
    page-clock=yes \
    max-memory-usage=3000KiB \
    disabled=no

# График по интерфейсу:
/tool graphing queue add \
    name=wan-traffic \
    interface=pppoe-out1 \
    store-every=5m \
    disabled=no

# Просмотр графиков — в WebFig/WinBox → Graphing.`,
        'Включение графиков'),
      NOTE('Графики доступны в веб-интерфейсе роутера (WebFig) и показывают историю нагрузки за дни/недели.')
    ]}
  ]
});
