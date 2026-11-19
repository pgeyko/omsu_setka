package api

import (
	"bytes"
	"fmt"
	"html/template"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

const shareFallbackDescription = "Расписание ОмГУ: пары, аудитории, замены и уведомления."

var shareGroupTemplate = template.Must(template.New("share-group").Parse(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{{.Title}}</title>
  <meta name="description" content="{{.Description}}">
  <meta name="theme-color" content="#0C100D">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="сетка">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="{{.Title}}">
  <meta property="og:description" content="{{.Description}}">
  <meta property="og:url" content="{{.PageURL}}">
  <meta property="og:image" content="{{.ImageURL}}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{.Title}}">
  <meta name="twitter:description" content="{{.Description}}">
  <meta name="twitter:image" content="{{.ImageURL}}">
  <link rel="canonical" href="{{.PageURL}}">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
      background: #0c100d; color: #f7f8f3; font: 16px/1.5 "Golos Text", "Segoe UI", system-ui, sans-serif; }
    main { width: min(520px, 100%); }
    .brand { font: 600 28px/1 "Oswald", "Golos Text", sans-serif; letter-spacing: .01em; }
    .brand i { display: inline-block; width: 9px; height: 9px; margin-left: 5px; background: #c22c12; }
    p { margin: 18px 0 0; color: #a4b0a6; }
    h1 { margin: 8px 0 0; font-size: clamp(24px, 6vw, 34px); line-height: 1.15; letter-spacing: -.02em; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 1px solid #3b473d;
      color: #f7f8f3; text-decoration: none; border-radius: 3px; }
    a.primary { background: #f7f8f3; border-color: #f7f8f3; color: #0c100d; font-weight: 600; }
    noscript p { margin-top: 12px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">сетка<i></i></div>
    <p>Расписание ОмГУ</p>
    <h1>{{.Name}}</h1>
    <p>{{.Description}}</p>
    <div class="actions">
      <a class="primary" href="/g/{{.ID}}/today">Сегодня</a>
      <a href="/g/{{.ID}}/week">Неделя</a>
    </div>
    <noscript><p>Включите JavaScript — или откройте расписание по кнопкам выше.</p></noscript>
  </main>
  <script src="/share-redirect.js" defer></script>
</body>
</html>
`))

type shareGroupData struct {
	ID          int
	Name        string
	Title       string
	Description string
	PageURL     string
	ImageURL    string
}

func publicBaseURL(c *fiber.Ctx) string {
	host := c.Get("Host")
	if host == "" {
		host = c.Hostname()
	}
	if host == "localhost" || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "[::1]") {
		return "http://" + host
	}
	// Shared links always use the public site URL, regardless of the host the
	// request reached us through.
	return "https://s.pgeyko.ru"
}

// @Summary Share page for a group
// @Description Returns a small HTML page with Open Graph metadata for Telegram/other link previews and a client-side redirect to today/week.
// @Tags Schedules
// @Produce text/html
// @Param id path int true "Group dictionary ID (dict_groups.id)"
// @Success 200 {string} string "HTML"
// @Failure 404 {string} string "HTML"
// @Router /share/group/{id} [get]
func (s *Server) handleShareGroup(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id < 1 || id > 999999 {
		return c.Status(fiber.StatusNotFound).Type("html").SendString(shareNotFoundPage())
	}

	group, err := s.DictRepo.GetGroupByID(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).Type("html").SendString(shareNotFoundPage())
	}
	if group == nil {
		return c.Status(fiber.StatusNotFound).Type("html").SendString(shareNotFoundPage())
	}

	name := strings.TrimSpace(group.Name)
	if name == "" {
		name = fmt.Sprintf("Группа %d", id)
	}
	base := publicBaseURL(c)
	data := shareGroupData{
		ID:          id,
		Name:        name,
		Title:       "Расписание группы " + name + " — сетка",
		Description: "Расписание группы " + name + ": пары, аудитории, замены и уведомления.",
		PageURL:     fmt.Sprintf("%s/g/%d", base, id),
		ImageURL:    base + "/og.png",
	}

	var out bytes.Buffer
	if err := shareGroupTemplate.Execute(&out, data); err != nil {
		return c.Status(fiber.StatusInternalServerError).Type("html").SendString(shareNotFoundPage())
	}
	c.Set("Cache-Control", "public, max-age=300")
	return c.Type("html").Send(out.Bytes())
}

func shareNotFoundPage() string {
	return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Группа не найдена — сетка</title><meta name="theme-color" content="#0C100D">
<meta property="og:site_name" content="сетка"><meta property="og:title" content="Группа не найдена — сетка">
<meta property="og:description" content="` + shareFallbackDescription + `"><meta property="og:image" content="/og.png">
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0c100d;color:#f7f8f3;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}a{color:#f7f8f3}</style>
</head><body><main><p>сетка</p><h1>Группа не найдена</h1><p><a href="/search">Найти группу</a></p></main></body></html>`
}
