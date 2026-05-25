# Rollback: DNS Records

После отката на Docker-сервер, у регистратора:

## setka.pgeyko.ru

```
setka.pgeyko.ru.          IN  CNAME  <IP сервера>
```

Или A-запись, если CNAME не нужен:
```
setka.pgeyko.ru.          IN  A     <IP сервера>
```

## Удалить (больше не нужны)

```
_acme-challenge.setka.pgeyko.ru.  IN  CNAME  fpq9vutvj76mvj5m8k3h.cm.yandexcloud.net.
_acme-challenge.setka.pgeyko.ru.  IN  TXT   "Ad85JV9osPlgJRgbIV8pACfU4xYpoByzJGA2UXgSIOk"
```

## SSL

Настроить в nginx proxy manager на сервере (Let's Encrypt).
