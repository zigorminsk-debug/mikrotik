/* Раздел: Резервный канал интернет (failover) */
section({
  id: 'failover',
  icon: '🔁',
  title: 'Резервный канал (failover)',
  badge: 'важное',
  lead: 'Два провайдера: основной работает постоянно, резервный включается автоматически при падении основного — ' +
        'и наоборот, при восстановлении основного трафик возвращается на него. Без участия администратора.',
  steps: [
    { t: 'Принцип работы авто-переключения', b: [
      IMG('assets/img/topology.svg', 'Два провайдера подключены к разным WAN-портам роутера'),
      P('В RouterOS переключение строится на **двух маршрутах по умолчанию** с разным `distance`:'),
      TBL(['Параметр', 'Основной канал', 'Резервный канал'], [
        ['distance', '**1** (приоритет выше)', '**2** (используется, когда distance-1 неактивен)'],
        ['check-gateway', 'ping — проверка шлюза', 'ping — проверка шлюза'],
        ['gateway-ping-interval', '10 с (ваш выбор 5–30)', '10 с'],
        ['Итог', 'Активен, пока шлюз отвечает', 'Включается через ~30–40 с молчания шлюза основного']
      ]),
      P('Шлюз молчит → маршрут основного становится **inactive** → таблица маршрутов берёт следующий (резервный). Шлюз вернулся → через 3–4 проверки активируется обратно. Переключение **автоматическое в обе стороны**.'),
      NOTE('Метки маршрутов (mangle) добавляются дополнительно, чтобы разорвавшиеся не должны были — реально работающие TCP-сессии оставались в том же канале до завершения. Их конфиг генерирует стенд автоматически.')
    ]},

    { t: 'Подготовка двух WAN-интерфейсов', b: [
      P('Оба провайдера настраиваются как в разделе «Подключение провайдера» (PPPoE/DHCP/статика/LTE), но **с маршрутом по умолчанию вручную**.'),
      CMD(
`# Пример: провайдер А = PPPoE (основной), провайдер Б = DHCP (резерв)
/interface pppoe-client add name=pppoe-out1 interface=ether1 \\
    user="ISP_A" password="PASS_A" add-default-route=no disabled=no

/ip dhcp-client add interface=ether2 add-default-route=no \\
    use-peer-dns=yes disabled=no comment="ISP_B"

# Список всех WAN-портов (для правил NAT/firewall):
/interface list add name=WAN
/interface list member add list=WAN interface=pppoe-out1
/interface list member add list=WAN interface=ether2

# Проверяем, что оба провайдера «живы»:
/interface print
/ip address print
/ip dhcp-client print`,
        'Два канала'),
      WARN('Оба провайдера **не должны** сами добавлять маршрут по умолчанию (`add-default-route=no`), иначе появятся два конкурирующих маршрута distance=1 — трафик начнёт «прыгать» между каналами.')
    ]},

    { t: 'Маршруты с check-gateway — сердце failover', b: [
      CMD(
`/ip route
add dst-address=0.0.0.0/0 gateway=pppoe-out1 distance=1 \\
    check-gateway=ping gateway-ping-interval=10s \\
    comment="ОСНОВНОЙ: ISP_A"

add dst-address=0.0.0.0/0 gateway=192.0.2.1 distance=2 \\
    check-gateway=ping gateway-ping-interval=10s \\
    comment="РЕЗЕРВ: ISP_B (шлюз DHCP-провайдера)"

# Посмотреть активный маршрут (флаг A = active):
/ip route print where dst-address=0.0.0.0/0`,
        'Два маршрута по умолчанию'),
      P('Как проверять: `/ip route print detail` → у активного маршрута флаг `A`, поле `gateway-status` показывает состояние шлюза (`reachable` / `unreachable`).'),
      UL([
        'Переключение занимает `gateway-ping-interval × 3–4` (при 10 с ≈ 30–40 с);',
        'Для PPPoE шлюзом выступает имя интерфейса (`gateway=pppoe-out1`);',
        'Для DHCP резерва шлюз известен из `/ip dhcp-client print detail` (поле gateway); можно задать статиком, если провайдер выдаёт постоянный шлюз.',
        'Оба маршрута **обязаны** иметь check-gateway — иначе RouterOS не заметит падение и продолжит слать трафик в мёртвый канал.'
      ])
    ]},

    { t: 'Метки соединений: сессии не рвутся при переключении', b: [
      P('Без меток при восстановлении основного все TCP-соединения (включая работающие RDP-сессии) мгновенно вернутся на основной и оборвутся. **Mangle** решает это:'),
      CMD(
`# Таблицы маршрутизации (RouterOS v7):
/routing table add name=to-primary fib
/routing table add name=to-backup fib

/ip firewall mangle
# новые соединения из LAN → основной канал:
add chain=prerouting in-interface-list=LAN connection-state=new \\
    connection-mark=no-mark new-connection-mark=conn-primary passthrough=yes
add chain=output connection-state=new connection-mark=no-mark \\
    new-connection-mark=conn-primary passthrough=yes
# те, что ушли в резерв, остаются в резерве:
add chain=postrouting out-interface=ether2 connection-state=new \\
    new-connection-mark=conn-backup passthrough=no
# метка соединения → стол маршрутов:
add chain=prerouting in-interface-list=LAN connection-mark=conn-primary \\
    new-routing-mark=to-primary passthrough=yes
add chain=prerouting in-interface-list=LAN connection-mark=conn-backup \\
    new-routing-mark=to-backup passthrough=yes
add chain=output connection-mark=conn-primary new-routing-mark=to-primary passthrough=no
add chain=output connection-mark=conn-backup new-routing-mark=to-backup passthrough=no

/ip route
add dst-address=0.0.0.0/0 gateway=pppoe-out1 distance=1 routing-mark=to-primary check-gateway=ping
add dst-address=0.0.0.0/0 gateway=192.0.2.1 distance=2 routing-mark=to-primary check-gateway=ping
add dst-address=0.0.0.0/0 gateway=192.0.2.1 distance=1 routing-mark=to-backup check-gateway=ping
add dst-address=0.0.0.0/0 gateway=pppoe-out1 distance=2 routing-mark=to-backup check-gateway=ping`,
        'Mangle + маршруты по меткам'),
      P('Поведение после настройки: новые сессии всегда идут на основной; **живые** сессии, оказавшиеся в резерве, доработают на резерве и завершатся спокойно; никаких обрывов при failback.'),
      NOTE('Метки нужны только когда шлюзы статичны (PPPoE/статика). При DHCP/LTE-резерве достаточно distance + check-gateway — конфиг стенда это учитывает.')
    ]},

    { t: 'Netwatch: мониторинг каналов и уведомления', b: [
      P('Netwatch периодически пингует контролируемые адреса и запускает скрипты при событии — удобно для журнала/почты.'),
      CMD(
`/tool netwatch add host=8.8.8.8 type=icmp interval=10s timeout=1s \\
    comment="Интернет вообще"

/tool netwatch add host=192.0.2.1 type=icmp interval=10s \\
    comment="Шлюз ISP_B"

# Пример событий (настройте /tool e-mail заранее):
#   down-script=:log warning "НЕТ ИНТЕРНЕТА — канал down"
#   up-script=:log info "Интернет восстановлен"

# Журнал событий:
/log print where topics~"netwatch"`,
        'Netwatch'),
      TIP('Для тонкой диагностики: `/ip route print detail` + `gateway-status`, `/interface monitor-traffic pppoe-out1 once` — видно биты/ошибки в реальном времени.')
    ]},

    { t: 'Тестирование failover в реальных условиях', b: [
      OL([
        'Зафиксируйте активный маршрут: `/ip route print` (флаг `A` у distance=1).',
        'Имитация аварии: отключите кабель **основного** провайдера (или `/interface disable pppoe-out1`).',
        'Через ~30–40 с: `/ip route print` → активен distance=2, `ping 8.8.8.8` работает, сессии (например открытая страница) переживают переключение.',
        'Верните канал: `/interface enable pppoe-out1` → через тот же интервал активным снова станет distance=1.',
        'Проверьте журнал: `/log print` — события netwatch/линков.'
      ]),
      CMD(
`/interface disable [ find name=pppoe-out1 ]   # авария основного
:delay 40s
/ip route print where dst-address=0.0.0.0/0   # активен резерв?
/interface enable [ find name=pppoe-out1 ]    # восстановление`,
        'Скрипт проверки переключения'),
      WARN('Протестируйте **до** выезда администратора: failover, проверенный только «на бумаге», в день аварии почти всегда требует ручной правки (типичные ошибки — оба канала сами добавили default-маршрут или нет check-gateway).')
    ]},

    { t: 'Три провайдера и балансировка — кратко', b: [
      P('Сценарий: 1 основной + 2 резервных. Принцип тот же: добавьте третий маршрут `distance=3`:'),
      CMD(
`/ip route add dst-address=0.0.0.0/0 gateway=pppoe-out3 distance=3 \\
    check-gateway=ping comment="ВТОРОЙ РЕЗЕРВ"`,
        'Третий канал'),
      P('Нагрузное распределение (PCC) между каналами — тема отдельной настройки (`/ip firewall mangle` + `routing-mark` по хешу src/dst): используйте, когда каналов несколько и нужна суммарная пропускная способность, а не просто резерв.')
    ]}
  ]
});
