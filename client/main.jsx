import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Analytics from "./Analytics.jsx";
import "./style.css";
import "./status.css";
import "./localization.css";
let token = localStorage.getItem("promptlab-token") || "";
const resourceCache = new Map();
const api = (p, o = {}) =>
  fetch("/api" + p, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...o,
    body: o.body && JSON.stringify(o.body),
  }).then(async (r) => {
    let d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401)
        window.dispatchEvent(new Event("promptlab:auth-expired"));
      const error = Error(d.error || "Ошибка API");
      error.status = r.status;
      throw error;
    }
    return d;
  });
const Icon = ({ children }) => <b className="icon">{children}</b>,
  NavigationIcon = ({ name }) => {
    const paths = {
      overview: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 15l3-3 3 2 4-5"/></>,
      agents: <><circle cx="12" cy="8" r="3"/><path d="M5 21c.7-4 3.1-6 7-6s6.3 2 7 6"/></>,
      datasets: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
      simulations: <><path d="M5 7h14v10H5z"/><path d="M9 11l5 2-5 2z"/></>,
      versions: <><path d="M6 4h9l3 3v13H6z"/><path d="M9 12h6M9 16h6M15 4v4h4"/></>,
      evals: <><path d="M4 12l5 5L20 6"/><path d="M4 6h7M13 18h7"/></>,
      analytics: <><path d="M5 19V5M5 19h15"/><path d="M8 15l4-4 3 2 4-6"/></>,
      "demo-mode": <><circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/></>,
      publication: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 14v5h14v-5"/></>,
      "admin-settings": <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1A7 7 0 0015 6l-.3-2.6h-4L10.4 6a7 7 0 00-1.6.9l-2.3-1-2 3.4L6.5 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.6.9l.3 2.6h4l.3-2.6a7 7 0 001.6-.9l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></>,
    };
    return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.overview}</svg>;
  },
  Notice = ({ children }) =>
    children ? <div className="notice">{children}</div> : null;
function useResource(path) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(
    () => resourceCache.get(path) || { status: "loading", data: null },
  );
  useEffect(() => {
    let alive = true;
    const cached = resourceCache.get(path);
    if (cached) {
      setState(cached);
      return () => {
        alive = false;
      };
    }
    setState({ status: "loading", data: null });
    api(path)
      .then((data) => {
        const next = { status: "ready", data };
        resourceCache.set(path, next);
        if (alive) setState(next);
      })
      .catch((error) => {
        if (alive) setState({ status: "error", data: null, error });
      });
    return () => {
      alive = false;
    };
  }, [path, attempt]);
  return {
    ...state,
    replace: (data) => {
      const next = { status: "ready", data };
      resourceCache.set(path, next);
      setState(next);
    },
    retry: () => {
      resourceCache.delete(path);
      setAttempt((current) => current + 1);
    },
  };
}
function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw Error("В CSV не закрыта кавычка.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2)
    throw Error("CSV должен содержать строку заголовков и кейсы.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header))
    throw Error("В CSV найдены пустые заголовки.");
  return rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(
        headers.map((header, index) => [header, cells[index] || ""]),
      ),
    );
}
function readCases(file) {
  return file.text().then((text) => {
    if (file.name.toLowerCase().endsWith(".json")) {
      const payload = JSON.parse(text);
      const cases = Array.isArray(payload)
        ? payload
        : payload.cases || payload.items || payload.resumes;
      if (!Array.isArray(cases))
        throw Error(
          "Это не тестовый набор. Здесь нужен JSON-массив кейсов или объект с полем cases; экспорт промпта добавляется в «Версиях промптов».",
        );
      return cases;
    }
    return parseCsv(text);
  });
}
async function readPromptExport(file) {
  if (!file.name.toLowerCase().endsWith(".json")) return null;
  const payload = JSON.parse(await file.text());
  const prompt =
    payload.systemPrompt || payload.system_prompt || payload.prompt;
  if (payload.scope === "prompt" && typeof prompt === "string" && prompt.trim())
    return {
      name: payload.name || "Импорт · системный промпт",
      prompt: prompt.trim(),
      exportedAt: payload.exportedAt,
    };
  return null;
}
function StatePanel({ title, children, retry }) {
  return (
    <section className="panel state-panel">
      <span className="state-mark" aria-hidden="true">
        {retry ? "!" : "·"}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
        {retry && (
          <button className="ghost" onClick={retry}>
            Повторить загрузку
          </button>
        )}
      </div>
    </section>
  );
}
class AppErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Prompt Lab render error", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-screen" role="alert">
        <p className="eyebrow">ИНТЕРФЕЙС ВОССТАНАВЛИВАЕТСЯ</p>
        <h1>Не удалось открыть раздел.</h1>
        <p>
          Данные не изменены. Повторите попытку — приложение перезагрузится и
          восстановит безопасное состояние.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Восстановить интерфейс
        </button>
      </main>
    );
  }
}
function Login({ onLogin, space }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(null);
  useEffect(() => {
    fetch("/api/demo/status")
      .then((r) => r.json())
      .then(setDemo)
      .catch(() => setDemo({ enabled: false }));
  }, []);
  async function enter(path, body) {
    setBusy(true);
    setError("");
    try {
      let r = await api(path, { method: "POST", body });
      token = r.token;
      localStorage.setItem("promptlab-token", token);
      onLogin(r.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    return enter(
      space === "admin" && demo?.enabled && demo?.adminPassword
        ? "/demo/admin-login"
        : "/auth/login",
      { password },
    );
  }
  if (demo?.publicHome && space === "lab")
    return (
      <div className="login">
        <section>
          <div className="labmark">✦</div>
          <p className="eyebrow">ПУБЛИЧНАЯ ДЕМОНСТРАЦИЯ</p>
          <h1>
            AI Prompt
            <br />
            <em>Lab.</em>
          </h1>
          <p>Полный контур проверки промптов открыт для демонстрации.</p>
        </section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enter("/demo/session", {});
          }}
        >
          <p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</p>
          <h2>Открыть демо</h2>
          <p>Регистрация и пароль не требуются.</p>
          <Notice>{error}</Notice>
          <button className="primary" disabled={busy}>
            {busy ? "Открываем…" : "Перейти в лабораторию"}
          </button>
        </form>
      </div>
    );
  let demoAdmin = space === "admin" && demo?.enabled && demo?.adminPassword;
  return (
    <div className="login">
      <section>
        <div className="labmark">✦</div>
        <p className="eyebrow">КОНТРОЛИРУЕМОЕ УЛУЧШЕНИЕ AI</p>
        <h1>
          AI Prompt
          <br />
          <em>Lab.</em>
        </h1>
        <p>
          Тестируйте и публикуйте версии промптов только на доказательствах.
        </p>
      </section>
      <form onSubmit={submit}>
        <p className="eyebrow">
          {demoAdmin ? "ДЕМО-АДМИНКА" : "ВХОД АДМИНИСТРАТОРА"}
        </p>
        <h2>{demoAdmin ? "Доступ к демонстрации" : "Открыть лабораторию"}</h2>
        <label>
          Пароль
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
          />
        </label>
        <Notice>{error}</Notice>
        <button className="primary" disabled={busy}>
          {busy ? "Проверяем…" : "Войти"}
        </button>
        {demoAdmin && (
          <small>Для демонстрации используется отдельный пароль.</small>
        )}
      </form>
    </div>
  );
}
function Sidebar({
  tab,
  setTab,
  theme,
  setTheme,
  space,
  setSpace,
  user,
  demo,
}) {
  let labItems = [
      ["overview", "Обзор"],
      ["agents", "Агенты"],
      ["versions", "Паспорта и версии"],
      ["datasets", "Тестовые наборы"],
      ["evals", "Проверки"],
      ["simulations", "Симуляции"],
      ["analytics", "Аналитика"],
    ].filter((x) => !user.isDemo || demo.capabilities?.[x[0]]),
    developerItems = [
      ["demo-mode", "Демо-режим"],
      ["publication", "Публикация"],
    ],
    adminItems = [["admin-settings", "Настройки"]],
    items =
      space === "developer"
        ? developerItems
        : space === "admin"
          ? adminItems
          : labItems;
  function open(x) {
    if (space === "developer") {
      location.hash = x[0];
      document
        .getElementById(x[0])
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (space === "admin") return;
    setTab(x[0]);
    setSpace("lab");
  }
  return (
    <aside className="side">
      <div className="brand">
        <i>✦</i>
        <span>
          AI PROMPT
          <small>
            {space === "developer"
              ? "КОНСОЛЬ РАЗРАБОТЧИКА"
              : space === "admin"
                ? "АДМИНИСТРАТИВНЫЙ КАБИНЕТ"
                : "LABORATORY"}
          </small>
        </span>
      </div>
      <nav>
        {items.map((x) => (
          <button
            className={
              (
                space === "developer"
                  ? location.hash.slice(1) ===
                    (location.hash ? x[0] : "demo-mode")
                  : space === "admin"
                    ? x[0] === "admin-settings"
                    : tab === x[0]
              )
                ? "active"
                : ""
            }
            key={x[0]}
            onClick={() => open(x)}
          >
            <NavigationIcon name={x[0]} />
            {x[1]}
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Icon>☾</Icon>
          {theme === "dark" ? "Светлая" : "Тёмная"} тема
        </button>
        <div className="identity">
          <span>{user.email[0].toUpperCase()}</span>
          <div>
            <strong>{user.isDemo ? "Демо-доступ" : user.email}</strong>
            <small>{user.isDemo ? "демонстрация" : user.role}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
function Overview({ data, setTab }) {
  let m = data.metrics;
  if (m.requests === 0)
    return (
      <Page
        eyebrow="СОСТОЯНИЕ ЛАБОРАТОРИИ"
        title={
          <>
            Лаборатория
            <br />
            <em>готова к запуску.</em>
          </>
        }
        action={
          <button className="primary" onClick={() => setTab("versions")}>
            Импортировать паспорт
          </button>
        }
      >
        <LabWorkflow setTab={setTab} />
        <section className="launch-stage">
          <div className="launch-copy">
            <span className="stage-index">01</span>
            <h2>Первая проверка начинается с паспорта агента.</h2>
            <p>
              Импортируйте паспорт — лаборатория создаст из него копию агента
              и первый черновик промпта. Затем добавьте реальные пары и
              выполните независимую проверку.
            </p>
            <small>Никаких синтетических метрик до первого запуска.</small>
          </div>
          <figure className="launch-visual">
            <img
              src="/art/evidence-dossier.webp"
              alt="Иллюстрация досье для проверки доказательств"
            />
            <figcaption>
              <span>Контур качества</span>
              <b>Исходные данные → проверяемый вывод</b>
            </figcaption>
          </figure>
        </section>
      </Page>
    );
  return (
    <Page
      eyebrow="СОСТОЯНИЕ ЛАБОРАТОРИИ"
      title={
        <>
          Улучшайте промпты
          <br />
          <em>на доказательствах.</em>
        </>
      }
      action={
        <button className="primary" onClick={() => setTab("versions")}>
          + Новая версия
        </button>
      }
    >
      <LabWorkflow setTab={setTab} />
      <p className="intro">
        Независимые проверки, понятные версии и публикация только после
        подтверждения администратора.
      </p>
      <section className="metrics">
        {[
          [`${m.quality}%`, "Качество на holdout"],
          [`${m.json}%`, "Валидный JSON"],
          [`${m.guardrails}%`, "Соблюдение ограничений"],
          [`${m.cost.toFixed(2)} $`, "Расход за 7 дней"],
        ].map(([v, l]) => (
          <article className="metric" key={l}>
            <strong>{v}</strong>
            <span>{l}</span>
          </article>
        ))}
      </section>
    </Page>
  );
}
function Page({ eyebrow, title, action, children }) {
  return (
    <main className="main">
      <header>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}
function LabWorkflow({ setTab }) {
  const steps = [
    ["01", "Импорт паспорта", "создаёт копию агента", "versions"],
    ["02", "Тестовые пары", "вакансия и резюме", "datasets"],
    ["03", "Проверка версий", "независимый eval", "versions"],
    ["04", "Симуляция", "ручной запуск копии", "simulations"],
    ["05", "Сравнение", "результаты и история", "analytics"],
  ];
  return <nav className="lab-workflow" aria-label="Порядок работы с лабораторией">
    {steps.map(([index, title, detail, tab]) => <button type="button" key={index} onClick={() => setTab(tab)}>
      <span>{index}</span><b>{title}</b><small>{detail}</small>
    </button>)}
  </nav>;
}
function Agents({ setTab, setSelectedAgent, user }) {
  const resource = useResource("/agents");
  const [view, setView] = useState(
    () => localStorage.getItem("promptlab-agent-view") || "large",
  );
  const [form, setForm] = useState({
    name: "",
    kind: "custom",
    description: "",
    note: "",
  });
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const canChange = user.role === "admin" || user.role === "editor";
  useEffect(() => localStorage.setItem("promptlab-agent-view", view), [view]);
  const agents = resource.data?.items || [];
  const visualFor = (agent) =>
    agent.kind === "sales"
      ? ["/art/conversation-still-life.webp", "Контекст диалога"]
      : ["/art/evidence-dossier.webp", "Контур проверки"];
  function beginCreate() {
    setForm({ name: "", kind: "custom", description: "", note: "" });
    setEditing({ id: null });
  }
  function beginEdit(agent) {
    setForm({
      name: agent.name,
      kind: agent.kind,
      description: agent.description,
      note: agent.note || "",
    });
    setEditing(agent);
  }
  async function save(event) {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await api(
        editing.id ? `/agents/${editing.id}` : "/agents",
        {
          method: editing.id ? "PUT" : "POST",
          body: form,
        },
      );
      const items = editing.id
        ? agents.map((agent) =>
            agent.id === result.item.id ? result.item : agent,
          )
        : [...agents, result.item];
      resource.replace({ items });
      resourceCache.delete("/agents");
      setEditing(null);
      setNote(editing.id ? "Агент обновлён." : "Агент добавлен в лабораторию.");
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    try {
      setBusy(true);
      await api(`/agents/${deleteTarget.id}`, { method: "DELETE" });
      resource.replace({
        items: agents.filter((agent) => agent.id !== deleteTarget.id),
      });
      resourceCache.delete("/agents");
      setDeleteTarget(null);
      setNote("Агент удалён из каталога.");
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  }
  function open(agent) {
    setSelectedAgent(agent);
    setTab("versions");
  }
  return (
    <Page
      eyebrow="КАТАЛОГ АГЕНТОВ"
      title={
        <>
          Сколько угодно агентов,
          <br />
          <em>одна лаборатория.</em>
        </>
      }
      action={
        canChange && (
          <div className="header-actions">
            <button className="ghost" onClick={beginCreate}>Добавить вручную</button>
            <button className="primary" onClick={() => { setSelectedAgent(null); setTab("versions"); }}>Импортировать паспорт</button>
          </div>
        )
      }
    >
      <Notice>{note}</Notice>
      <LabWorkflow setTab={setTab} />
      <div className="collection-toolbar">
        <p>
          {agents.length
            ? `В каталоге: ${agents.length}`
            : "Каталог пока пуст. Добавьте первого агента."}
        </p>
        <div className="view-toggle" aria-label="Вид каталога">
          {[
            ["large", "▣", "Крупно"],
            ["grid", "▦", "Плитка"],
            ["compact", "☷", "Компактно"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={view === id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
      {resource.status === "loading" ? (
        <StatePanel title="Загружаем каталог агентов…">
          Проверяем доступные профили и их настройки.
        </StatePanel>
      ) : resource.status === "error" ? (
        <StatePanel title="Не удалось загрузить каталог" retry={resource.retry}>
          {resource.error.message}
        </StatePanel>
      ) : agents.length ? (
        <div className={`agents agents-${view}`}>
          {agents.map((agent, index) => {
            const [image, visual] = visualFor(agent);
            return (
              <article key={agent.id} title={agent.description}>
                <figure className="agent-visual">
                  <img src={image} alt="" />
                  <figcaption>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{visual}</b>
                  </figcaption>
                </figure>
                <p className="eyebrow">{agent.kind.toUpperCase()}</p>
                <h2>{agent.name}</h2>
                <p>{agent.description}</p>
                {agent.note && <small>{agent.note}</small>}
                <div className="agent-actions">
                  <button className="primary" onClick={() => open(agent)}>
                    Открыть →
                  </button>
                  {canChange && (
                    <>
                      <button
                        className="icon-button"
                        title="Редактировать агента"
                        aria-label={`Редактировать «${agent.name}»`}
                        onClick={() => beginEdit(agent)}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-button danger-hover"
                        title="Удалить агента"
                        aria-label={`Удалить «${agent.name}»`}
                        onClick={() => setDeleteTarget(agent)}
                      >
                        <svg
                          className="trash-icon"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <StatePanel title="В каталоге ещё нет агентов">
          Начните с импорта паспорта: его название, назначение и правила
          создадут здесь локальную копию агента автоматически.
        </StatePanel>
      )}
      {editing && (
        <div className="modal-backdrop" role="presentation">
          <form className="agent-editor" onSubmit={save}>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">
                  {editing.id ? "РЕДАКТИРОВАНИЕ АГЕНТА" : "НОВЫЙ АГЕНТ"}
                </p>
                <h3>{editing.id ? editing.name : "Добавить агента"}</h3>
              </div>
              <button
                type="button"
                className="ghost compact"
                onClick={() => setEditing(null)}
              >
                Закрыть
              </button>
            </div>
            <label>
              Название
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            {!editing.id && (
              <p className="editor-hint">
                Это запасной путь для нестандартного агента без паспорта.
                Для обычной проверки вернитесь и импортируйте паспорт: он
                создаст агента с названием и правилами автоматически.
              </p>
            )}
            <label>
              Задача агента
              <textarea
                required
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <label>
              Примечание для команды
              <input
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
            <div>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing(null)}
              >
                Отмена
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Сохраняем…" : "Сохранить агента"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="delete-modal" role="dialog" aria-modal="true">
            <p className="eyebrow">УДАЛЕНИЕ АГЕНТА</p>
            <h3>Удалить «{deleteTarget.name}»?</h3>
            <p>
              Агент исчезнет из каталога. Его уже созданные версии промптов и
              журнал запусков сохранятся.
            </p>
            <div>
              <button className="ghost" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Удаляем…" : "Удалить агента"}
              </button>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
function Datasets({ user, setTab, refresh, data: overview, selectedAgent }) {
  const resource = useResource("/datasets");
  const agentResource = useResource("/agents");
  const data = resource.data;
  const fileInput = useRef(null);
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [promptAgent, setPromptAgent] = useState("");
  const [deleteDataset, setDeleteDataset] = useState(null);
  const [datasetAgent, setDatasetAgent] = useState("");
  const [manualCases, setManualCases] = useState([]);
  const [caseForm, setCaseForm] = useState({ vacancyText: "", resumeText: "" });
  const canImport = user.role === "admin" || user.role === "editor";
  const agents = agentResource.data?.items || [];
  const packageVersions = (overview?.versions || []).filter(
    (version) => version.evalPlan?.operations?.[0]?.inputSchema?.properties,
  );
  const packageVersion = packageVersions.find((version) => version.agent === datasetAgent);
  const inputFields = Object.entries(
    packageVersion?.evalPlan?.operations?.[0]?.inputSchema?.properties || {},
  );
  useEffect(() => {
    if (selectedAgent?.id) setDatasetAgent(selectedAgent.id);
  }, [selectedAgent?.id]);
  useEffect(() => {
    if (!datasetAgent && packageVersions.length === 1)
      setDatasetAgent(packageVersions[0].agent);
  }, [datasetAgent, packageVersions]);
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 500 * 1024) {
      setNote("Файл больше 500 КБ. Разделите его на несколько импортов.");
      return;
    }
    try {
      setImporting(true);
      setNote("");
      const promptExport = await readPromptExport(file);
      if (promptExport) {
        setPendingPrompt(promptExport);
        setPromptAgent("");
        setNote(
          "Экспорт системного промпта прочитан. Выберите агента ниже, затем сохраните черновик.",
        );
        return;
      }
      const cases = await readCases(file);
      const result = await api("/datasets/import", {
        method: "POST",
        body: {
          name: file.name.replace(/\.(csv|json)$/i, ""),
          cases,
          agent: datasetAgent || undefined,
          mode: cases.length < 5 ? "smoke" : "evaluation",
        },
      });
      resource.replace({ items: [result.item, ...(data?.items || [])] });
      setNote(
        `Импортирован набор «${result.item.name}»: ${result.item.cases} кейсов, ${result.item.train}/${result.item.holdout}.`,
      );
    } catch (error) {
      setNote(error.message || "Не удалось импортировать файл.");
      setGuideOpen(true);
    } finally {
      setImporting(false);
    }
  }
  function addManualCase(event) {
    event.preventDefault();
    if (!datasetAgent || !caseForm.vacancyText.trim() || !caseForm.resumeText.trim()) {
      setNote("Выберите агента и заполните вакансию и резюме.");
      return;
    }
    setManualCases((items) => [...items, { ...caseForm, language: document.documentElement.lang?.slice(0, 2) || "ru", vacancyText: caseForm.vacancyText.trim(), resumeText: caseForm.resumeText.trim() }]);
    setCaseForm((item) => ({ ...item, vacancyText: "", resumeText: "" }));
    setNote("Кейс добавлен в локальный набор. Добавьте минимум 5, затем сохраните набор.");
  }
  async function saveManualCases(mode = manualCases.length < 5 ? "smoke" : "evaluation") {
    if (!manualCases.length || (mode === "evaluation" && manualCases.length < 5) || !datasetAgent) return;
    try {
      setImporting(true);
      const agent = agents.find((item) => item.id === datasetAgent);
      const result = await api("/datasets/import", { method: "POST", body: { name: `${mode === "smoke" ? "Пробный кейс" : "Кейсы"} · ${agent?.name || "агент"}`, agent: datasetAgent, mode, cases: manualCases } });
      resource.replace({ items: [result.item, ...(data?.items || [])] });
      setManualCases([]);
      setNote(mode === "smoke" ? "Пробный кейс сохранён. Он не участвует в сравнении версий 80/20." : `Набор сохранён: ${result.item.cases} кейсов, ${result.item.train}/${result.item.holdout}.`);
    } catch (error) { setNote(error.message || "Не удалось сохранить набор."); } finally { setImporting(false); }
  }
  async function removeDataset() {
    if (!deleteDataset) return;
    try {
      setImporting(true);
      await api(`/datasets/${deleteDataset.id}`, { method: "DELETE" });
      resource.replace({ items: (data?.items || []).filter((item) => item.id !== deleteDataset.id) });
      setDeleteDataset(null);
      setNote("Тестовый набор и его кейсы удалены.");
    } catch (error) { setNote(error.message || "Не удалось удалить тестовый набор."); } finally { setImporting(false); }
  }
  async function savePromptExport() {
    if (!pendingPrompt || !promptAgent) return;
    try {
      setImporting(true);
      const exported = pendingPrompt.exportedAt
        ? new Date(pendingPrompt.exportedAt).toLocaleDateString("ru-RU")
        : "";
      const selectedAgent = agents.find((agent) => agent.id === promptAgent);
      await api("/prompt-versions", {
        method: "POST",
        body: {
          name: exported
            ? `${pendingPrompt.name} · ${exported}`
            : pendingPrompt.name,
          agent: promptAgent,
          prompt: pendingPrompt.prompt,
        },
      });
      await refresh();
      setPendingPrompt(null);
      setNote(
        `Экспорт сохранён черновиком для «${selectedAgent?.name || "выбранного агента"}».`,
      );
    } catch (error) {
      setNote(error.message || "Не удалось сохранить черновик.");
    } finally {
      setImporting(false);
    }
  }
  return (
    <Page
      eyebrow="ТЕСТОВЫЕ НАБОРЫ"
      title={
        <>
          Надёжность —<br />
          <em>не случайность.</em>
        </>
      }
      action={
        canImport && (
          <>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".csv,application/json,.json,text/csv"
              onChange={importFile}
            />
            <button
              className="primary"
              disabled={importing}
              onClick={() => fileInput.current?.click()}
            >
              {importing ? "Импортируем…" : "Импорт CSV / JSON"}
            </button>
          </>
        )
      }
    >
      <section className="platform-accordion import-guide">
        <button
          type="button"
          className="platform-accordion-trigger"
          aria-expanded={guideOpen}
          aria-controls="dataset-import-guide"
          onClick={() => setGuideOpen((open) => !open)}
        >
          Что загружать в тестовые наборы
        </button>
        <div
          id="dataset-import-guide"
          className="platform-accordion-content"
          hidden={!guideOpen}
        >
          <p>
            Здесь загружаются не промпты, а кейсы для проверки поведения
            AI‑рекрутера: вакансия и резюме кандидата в каждой записи.
          </p>
          <p>
            JSON должен быть массивом кейсов или объектом с полем{" "}
            <code>cases</code>. CSV — таблицей с первой строкой заголовков.
            Один кейс сохраняется как пробный запуск. От 5 записей сервер сам
            закрепляет 80% для итераций и 20% для независимой проверки.
          </p>
          <pre className="format-example">{`{
  "cases": [{
    "language": "ru",
    "vacancy": {"title": "Backend developer", "requirements": ["Node.js"]},
    "resume": {"text": "Опыт Node.js — 3 года"}
  }]
}`}</pre>
          <p>
            Экспорт системного промпта сюда не подходит: его нужно добавлять как
            новую версию в разделе «Версии промптов».
          </p>
        </div>
      </section>
      <Notice>{note}</Notice>
      {packageVersions.length > 0 && (
        <section className="panel agent-case-builder">
          <p className="eyebrow">КЕЙСЫ ИЗ ПАСПОРТА АГЕНТА</p>
          <h2>Подготовьте данные для проверки</h2>
          <p>
            Поля ниже взяты из импортированного паспорта. Они станут входом
            для тестируемой копии агента, а не для рабочего AI Recruiter.
          </p>
          <label>
            Агент и версия
            <select value={datasetAgent} onChange={(event) => setDatasetAgent(event.target.value)}>
              <option value="">Выберите агента</option>
              {packageVersions.map((version) => <option key={version.id} value={version.agent}>{agents.find((agent) => agent.id === version.agent)?.name || "Агент"} · {version.name}</option>)}
            </select>
          </label>
          {packageVersion && (
            <form className="case-form" onSubmit={addManualCase}>
              {inputFields.map(([key, schema]) => (
                <label key={key} className="case-form-wide">
                  {schema.title || (key === "vacancyText" ? "Текст вакансии" : key === "resumeText" ? "Текст резюме" : key)}
                  <textarea required minLength={schema.minLength || 1} value={caseForm[key] || ""} onChange={(event) => setCaseForm((item) => ({ ...item, [key]: event.target.value }))} placeholder={key === "vacancyText" ? "Вставьте полный текст вакансии" : key === "resumeText" ? "Вставьте обезличенный текст резюме" : "Введите значение"} />
                </label>
              ))}
              <div className="case-form-actions">
                <button className="ghost" type="submit">+ Добавить кейс</button>
                <span>{manualCases.length} {manualCases.length === 1 ? "кейс" : "кейсов"}{manualCases.length === 0 ? " · можно начать с одного пробного кейса" : manualCases.length < 5 ? " · пробный запуск; от 5 доступно сравнение 80/20" : " · набор готов к сравнению 80/20"}</span>
                <button className="primary" type="button" disabled={!manualCases.length || importing} onClick={() => saveManualCases()}>{!manualCases.length ? "Сначала добавьте пару" : manualCases.length < 5 ? "Сохранить пробный кейс" : "Сохранить набор 80/20"}</button>
              </div>
            </form>
          )}
        </section>
      )}
      {pendingPrompt && (
        <section className="panel prompt-import-target">
          <div>
            <p className="eyebrow">КУДА ДОБАВИТЬ ПРОМПТ</p>
            <h2>Выберите агента для черновика</h2>
            <p>
              Файл содержит текст промпта, но не содержит идентификатор агента.
              Назначение выбирается вручную и будет видно в истории версий.
            </p>
          </div>
          <label>
            Агент
            <select
              value={promptAgent}
              onChange={(event) => setPromptAgent(event.target.value)}
            >
              <option value="">Выберите агента</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button
              className="ghost"
              disabled={importing}
              onClick={() => {
                setPendingPrompt(null);
                setNote("Импорт промпта отменён. Файл не был сохранён.");
              }}
            >
              Отмена
            </button>
            <button
              className="primary"
              disabled={!promptAgent || importing}
              onClick={savePromptExport}
            >
              {importing ? "Сохраняем…" : "Сохранить черновик"}
            </button>
          </div>
        </section>
      )}
      {note.startsWith("Экспорт сохранён черновиком") && (
        <button className="ghost" onClick={() => setTab("versions")}>
          Открыть черновик в версиях промптов →
        </button>
      )}
      {note.startsWith("Пробный кейс сохранён") && (
        <section className="next-step-panel">
          <b>Пробный кейс сохранён</b>
          <p>Теперь откройте черновик версии и запустите проверку на этом кейсе.</p>
          <button className="primary" onClick={() => setTab("versions")}>
            Перейти к проверке промпта →
          </button>
        </section>
      )}
      {resource.status === "loading" ? (
        <StatePanel title="Загружаем состав наборов…">
          Проверяем доступные тестовые наборы и их защищённые части.
        </StatePanel>
      ) : resource.status === "error" ? (
        <StatePanel title="Не удалось загрузить наборы" retry={resource.retry}>
          {resource.error.message}
        </StatePanel>
      ) : data.items.length ? (
        <>
          <div className="table">
            {data.items.map((x) => (
              <article key={x.id}>
                <div>
                  <h2>{x.name}</h2>
                  <p>{x.languages}</p>
                </div>
                <b>
                  {x.cases}
                  <small> кейсов</small>
                </b>
                <div className="split">
                  <i style={{ width: `${(x.train / x.cases) * 100}%` }} />
                </div>
                <p>
                  {x.mode === "smoke" ? (
                    <>Пробный набор · не участвует в сравнении 80/20</>
                  ) : (
                    <><strong>{x.train}</strong> итерации · <strong>{x.holdout}</strong> holdout</>
                  )}
                </p>
                {x.mode === "smoke" && (
                  <button className="ghost compact" onClick={() => setTab("versions")}>
                    Проверить промпт →
                  </button>
                )}
                {x.mode !== "smoke" && (
                  <button className="ghost compact" onClick={() => setTab("versions")}>
                    Открыть версии для проверки →
                  </button>
                )}
                {canImport && (
                  <button className="icon-button danger-hover" title="Удалить тестовый набор" aria-label={`Удалить «${x.name}»`} onClick={() => setDeleteDataset(x)}>
                    <svg className="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13" /></svg>
                  </button>
                )}
              </article>
            ))}
          </div>
          <div className="callout">
            {data.items.some((item) => item.mode !== "smoke") ? <><b>80/20 защищено сервером</b><p>Независимые финальные кейсы нельзя включить в генерацию улучшений или изменить через редактор наборов.</p></> : <><b>Пробный режим</b><p>Один кейс помогает проверить промпт и формат ответа. Для сравнения версий добавьте от 5 разнообразных кейсов.</p></>}
          </div>
        </>
      ) : (
        <>
          <StatePanel title="Тестовых наборов пока нет">
            {canImport
              ? "Здесь появятся только кейсы для проверки рекрутера: вакансия и резюме в каждой записи. Экспорт системного промпта не является набором и сохраняется в «Версиях промптов»."
              : "Администратор или редактор должен импортировать CSV либо JSON с вакансиями и резюме. Экспорт промпта отображается в «Версиях промптов»."}
          </StatePanel>
          <button
            className="ghost empty-next-step"
            onClick={() => setTab("versions")}
          >
            Открыть версии промптов →
          </button>
        </>
      )}
      {deleteDataset && (
        <div className="modal-backdrop" role="presentation">
          <section className="delete-modal" role="dialog" aria-modal="true">
            <p className="eyebrow">УДАЛЕНИЕ ТЕСТОВОГО НАБОРА</p>
            <h3>Удалить «{deleteDataset.name}»?</h3>
            <p>Будут удалены {deleteDataset.cases} сохранённый кейс{deleteDataset.cases === 1 ? "" : "а"}. Это действие нельзя отменить.</p>
            <div><button className="ghost" disabled={importing} onClick={() => setDeleteDataset(null)}>Отмена</button><button className="danger-button" disabled={importing} onClick={removeDataset}>{importing ? "Удаляем…" : "Удалить набор"}</button></div>
          </section>
        </div>
      )}
    </Page>
  );
}
function Simulations({ user, setTab, setSelectedAgent }) {
  const scenarios = useResource("/simulations/scenarios");
  const workspaces = useResource("/simulations/workspaces");
  const promptVersions = useResource("/prompt-versions");
  const [selected, setSelected] = useState("interest"),
    [result, setResult] = useState(null),
    [note, setNote] = useState(""),
    [recruiterId, setRecruiterId] = useState(""),
    [recruiterVersionId, setRecruiterVersionId] = useState(""),
    [vacancyText, setVacancyText] = useState(""),
    [resumeText, setResumeText] = useState(""),
    [recruiterResult, setRecruiterResult] = useState(null),
    [runningRecruiter, setRunningRecruiter] = useState(false);
  const sc = scenarios.data?.items || [];
  const spaces = workspaces.data?.items || [];
  const recruiterSpaces = spaces.filter((space) => space.kind === "recruiter" && space.hasPassport);
  const recruiterVersions = (promptVersions.data?.items || []).filter((version) => version.agent === recruiterId);
  const selectedRecruiterVersion = recruiterVersions.find((version) => version.id === recruiterVersionId) || recruiterVersions[0] || null;
  const canRun = user.role === "admin" || user.role === "editor";
  useEffect(() => {
    if (!recruiterId && recruiterSpaces[0]) setRecruiterId(recruiterSpaces[0].id);
  }, [recruiterId, recruiterSpaces]);
  useEffect(() => {
    if (selectedRecruiterVersion && recruiterVersionId !== selectedRecruiterVersion.id)
      setRecruiterVersionId(selectedRecruiterVersion.id);
  }, [recruiterVersionId, selectedRecruiterVersion]);
  async function run() {
    setNote("");
    try {
      setResult(
        (
          await api("/simulations", {
            method: "POST",
            body: { scenarioId: selected },
          })
        ).item,
      );
    } catch (e) {
      setNote(e.message);
    }
  }
  async function runRecruiter() {
    if (!selectedRecruiterVersion) return;
    setNote("");
    setRecruiterResult(null);
    setRunningRecruiter(true);
    try {
      const payload = await api("/simulations/recruiter", {
        method: "POST",
        body: {
          agentId: recruiterId,
          versionId: selectedRecruiterVersion.id,
          vacancyText,
          resumeText,
        },
      });
      setRecruiterResult(payload.item);
    } catch (error) {
      setNote(error.message);
    } finally {
      setRunningRecruiter(false);
    }
  }
  const evaluation = selectedRecruiterVersion?.datasetEvaluation;
  const holdout = evaluation?.holdout;
  return (
    <Page
      eyebrow="СИМУЛЯЦИИ И ПРОВЕРКИ"
      title={
        <>
          Проверяйте поведение
          <br />
          <em>до внедрения.</em>
        </>
      }
    >
      {workspaces.status === "loading" ? (
        <StatePanel title="Собираем рабочие области…">
          Сверяем импортированные паспорта, версии и тестовые данные.
        </StatePanel>
      ) : workspaces.status === "error" ? (
        <StatePanel title="Не удалось собрать симуляции" retry={workspaces.retry}>
          {workspaces.error.message}
        </StatePanel>
      ) : spaces.length ? (
        <section className="simulation-workspaces" aria-label="Рабочие области агентов">
          {spaces.map((space) => (
            <article className="simulation-workspace" key={space.id}>
              <div>
                <p className="eyebrow">{space.kind === "recruiter" ? "ПРОВЕРКА РЕКРУТЕРА" : space.kind === "sales" ? "ДИАЛОГИ ПРОДАЖ" : "СЦЕНАРИЙ АГЕНТА"}</p>
                <h2>{space.name}</h2>
                <p>{space.operation || "Операция будет определена после импорта паспорта."}</p>
              </div>
              <div className="simulation-meta">
                <span>{space.hasPassport ? "Паспорт подключён" : "Нужен паспорт"}</span>
                <span>{space.cases ? `${space.cases} тестовых пар` : "Нет тестовых пар"}</span>
              </div>
              {space.kind === "recruiter" ? (
                <button className="primary" onClick={() => {
                  setRecruiterId(space.id);
                  setRecruiterResult(null);
                  document.getElementById("recruiter-simulation")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                  Открыть копию агента →
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <StatePanel title="Импортируйте паспорт агента">
          После импорта здесь автоматически появится рабочая область с операцией агента и следующим действием.
        </StatePanel>
      )}
      {recruiterSpaces.length > 0 && (
        <section id="recruiter-simulation" className="panel recruiter-simulation" aria-labelledby="recruiter-simulation-title">
          <div className="simulation-heading">
            <div>
              <p className="eyebrow">ЛОКАЛЬНАЯ КОПИЯ АГЕНТА</p>
              <h2 id="recruiter-simulation-title">Симуляция AI-рекрутера</h2>
              <p>Запуск использует паспорт агента и выбранную версию промпта только внутри Prompt Lab. Рабочий AI Recruiter не меняется.</p>
            </div>
            <span className="local-copy-badge">Копия · без публикации</span>
          </div>
          <div className="simulation-selectors">
            {recruiterSpaces.length > 1 && <label>Агент<select value={recruiterId} onChange={(event) => { setRecruiterId(event.target.value); setRecruiterVersionId(""); setRecruiterResult(null); }}>
              {recruiterSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select></label>}
            <label>Версия промпта<select value={selectedRecruiterVersion?.id || ""} onChange={(event) => { setRecruiterVersionId(event.target.value); setRecruiterResult(null); }}>
              {recruiterVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · {version.status === "tested" ? "протестирована" : version.status === "draft" ? "черновик" : version.status}</option>)}
            </select></label>
          </div>
          {selectedRecruiterVersion ? <div className="simulation-version-summary">
            <div><span>Версия</span><b>{selectedRecruiterVersion.name}</b></div>
            <div><span>Независимая оценка</span><b>{holdout?.score ?? "—"}/10</b><small>{holdout ? `${holdout.cases} защищённых кейс${holdout.cases === 1 ? "" : "а"}` : "ещё не выполнялась"}</small></div>
            <div><span>JSON</span><b>{holdout?.validJson ?? selectedRecruiterVersion.json ?? "—"}%</b><small>доля ответов в JSON</small></div>
            <div><span>Без домысливаний</span><b>{holdout?.guardrails ?? selectedRecruiterVersion.guardrails ?? "—"}%</b><small>подтверждено оценщиком</small></div>
          </div> : <StatePanel title="Нет версии для симуляции">Импортируйте паспорт или создайте версию промпта для этого агента.</StatePanel>}
          <details className="metric-explainer">
            <summary>Что означает процент качества?</summary>
            <p><b>Качество</b> — средний балл независимого оценщика на защищённых holdout-кейсах по шкале 0–10, умноженный на 10. Например, 55% означает 5,5/10, а не «55% кандидатов подходят».</p>
            <p>JSON показывает, какая доля ответов разобралась как валидный JSON. «Без домысливаний» — доля случаев, где оценщик не нашёл неподтверждённых утверждений. При малом числе holdout-кейсов это ориентир, а не окончательный вывод.</p>
          </details>
          <div className="recruiter-input-grid">
            <label>Вакансия<textarea value={vacancyText} onChange={(event) => setVacancyText(event.target.value)} placeholder="Вставьте полный текст вакансии" /></label>
            <label>Резюме<textarea value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Вставьте обезличенный текст резюме кандидата" /></label>
          </div>
          {canRun && <button className="primary simulation-run" disabled={!selectedRecruiterVersion || !vacancyText.trim() || !resumeText.trim() || runningRecruiter} onClick={runRecruiter}>{runningRecruiter ? "Запускаем копию агента…" : "Запустить копию агента"}</button>}
          <Notice>{note}</Notice>
          {recruiterResult && <section className="simulation-result" aria-live="polite">
            <div className="simulation-result-heading"><div><p className="eyebrow">РЕЗУЛЬТАТ СИМУЛЯЦИИ</p><h3>{recruiterResult.version.name}</h3></div><small>{(recruiterResult.latencyMs / 1000).toFixed(1)} с · {recruiterResult.tokens} токенов</small></div>
            <div className="simulation-result-grid">
              <div><h4>Ответ копии агента</h4><pre>{JSON.stringify(recruiterResult.result, null, 2)}</pre></div>
              <div><h4>Независимая оценка</h4>{recruiterResult.judge ? <><b className="simulation-score">{recruiterResult.judge.score}/10</b><p>{recruiterResult.judge.decision || "Решение не указано"}</p><p>{recruiterResult.judge.reasoning || "Комментарий оценщика не получен."}</p><p><b>Без домысливаний:</b> {recruiterResult.judge.no_invention === true ? "подтверждено" : recruiterResult.judge.no_invention === false ? "обнаружены риски" : "не определено"}</p></> : <p>{recruiterResult.judgeError ? `Оценщик недоступен: ${recruiterResult.judgeError}` : "Оценка ещё не получена."}</p>}</div>
            </div>
          </section>}
        </section>
      )}
      {sc.length > 0 && (
        <section className="simulation-sales-block">
          <p className="eyebrow">ДИАЛОГОВЫЕ СЦЕНАРИИ</p>
          <h2>Продажные диалоги</h2>
          <p>Для агентов продаж здесь запускаются сохранённые сценарии клиента.</p>
        </section>
      )}
      {scenarios.status === "loading" ? (
        <StatePanel title="Загружаем сценарии…">
          Проверяем сценарии продаж и доступный бизнес-контекст.
        </StatePanel>
      ) : scenarios.status === "error" ? (
        <StatePanel
          title="Не удалось загрузить сценарии"
          retry={scenarios.retry}
        >
          {scenarios.error.message}
        </StatePanel>
      ) : sc.length ? (
        <section className="panel simulator">
          <label>
            Сценарий
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {sc.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.language} · {x.title}
                </option>
              ))}
            </select>
          </label>
          {canRun && (
            <button className="primary" onClick={run}>
              Запустить симуляцию
            </button>
          )}
          <small>
            Без ключа OpenAI запускается явно помеченный безопасный локальный
            сценарий.
          </small>
          <Notice>{note}</Notice>
          {result && (
            <div className="conversation">
              <p className="eyebrow">
                {result.mode === "server-model"
                  ? "СЕРВЕРНАЯ МОДЕЛЬ"
                  : "БЕЗОПАСНЫЙ ЛОКАЛЬНЫЙ РЕЖИМ"}
              </p>
              {result.messages.map((m) => (
                <div className={m.role} key={m.role}>
                  <b>{m.role === "client" ? "Клиент" : "Продажник"}</b>
                  <p>{m.text}</p>
                </div>
              ))}
              <div className="scores">
                {Object.entries(result.evaluation).map(([k, v]) => (
                  <span key={k}>
                    {k}: <b>{v}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </Page>
  );
}
function Versions({ data, refresh, user, setTab, selectedAgent }) {
  const [show, setShow] = useState(false),
    [form, setForm] = useState({ name: "", agent: "recruiter", prompt: "" }),
    [note, setNote] = useState(""),
    [editingId, setEditingId] = useState(null),
    [deleteTarget, setDeleteTarget] = useState(null),
    [setupVersion, setSetupVersion] = useState(null),
    [packagePreview, setPackagePreview] = useState(null),
    [packageAgent, setPackageAgent] = useState(""),
    [busy, setBusy] = useState(false),
    [actionBusy, setActionBusy] = useState(""),
    [openDetail, setOpenDetail] = useState("");
  const promptFileInput = useRef(null);
  const canChange = user.role === "admin" || user.role === "editor";
  const agentCatalog = useResource("/agents");
  const agentItems = agentCatalog.data?.items || [];
  const agentNames = Object.fromEntries(
    agentItems.map((agent) => [agent.id, agent.name]),
  );
  const setup = useResource("/setup-status");
  const displayVersionName = (name) => {
    const suffix = " · улучшение";
    let base = name;
    let count = 0;
    while (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      count += 1;
    }
    return count ? `${base} · Улучшение${count > 1 ? ` ×${count}` : ""}` : name;
  };
  const summarizeDiff = (diff) =>
    String(diff || "Изменения не описаны.")
      .replace(/\s+/g, " ")
      .replace(/^[•+\-]\s*/, "")
      .slice(0, 150);
  const versionItems = selectedAgent
    ? data.versions.filter((version) => version.agent === selectedAgent.id)
    : data.versions;
  const versionsById = Object.fromEntries(versionItems.map((version) => [version.id, version]));
  const generation = (version) => {
    let count = 0;
    let current = version;
    const seen = new Set();
    while (current?.sourceVersionId && !seen.has(current.id)) {
      seen.add(current.id);
      current = versionsById[current.sourceVersionId];
      if (current) count += 1;
    }
    return count;
  };
  const bestVersion = versionItems
    .filter((version) => Number.isFinite(version.datasetEvaluation?.holdout?.score))
    .sort((a, b) => b.datasetEvaluation.holdout.score - a.datasetEvaluation.holdout.score)[0];
  async function action(id, a) {
    if (actionBusy) return;
    try {
      setActionBusy(`${id}:${a}`);
      let r = await api(`/prompt-versions/${id}/${a}`, { method: "POST" });
      await refresh();
      setNote(
        a === "improve"
            ? r.existing
              ? `Черновик «${r.item.name}» уже создан. Он находится выше в списке.`
              : `Создан черновик «${r.item.name}». Сравните изменения и протестируйте новую версию.`
          : a === "judge"
            ? `Независимая оценка готова: ${r.item.score}/10.`
          : r.item?.status === "completed"
            ? `Пробная проверка завершена: 1 кейс, JSON валиден${Number.isInteger(r.item?.result?.score) ? `, самооценка агента ${r.item.result.score}/10` : ""}.${r.version?.lastEval?.judgeError ? ` Независимая оценка не выполнена: ${r.version.lastEval.judgeError}` : ""}`
            : "Проверка завершена, но модель вернула невалидный JSON. Ответ сохранён для разбора.",
      );
    } catch (e) {
      if (a === "test" && e.status === 409) {
        setSetupVersion(data.versions.find((version) => version.id === id));
        setNote("Перед тестом выполните отмеченные ниже шаги подготовки.");
      } else setNote(e.message);
    } finally {
      setActionBusy("");
    }
  }
  async function create(e) {
    e.preventDefault();
    try {
      setBusy(true);
      await api(
        editingId ? `/prompt-versions/${editingId}` : "/prompt-versions",
        { method: editingId ? "PUT" : "POST", body: form },
      );
      setShow(false);
      setEditingId(null);
      setForm({ name: "", agent: "recruiter", prompt: "" });
      await refresh();
      setNote(editingId ? "Черновик обновлён." : "Черновик создан.");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }
  function edit(version) {
    setForm({
      name: version.name,
      agent: version.agent,
      prompt: version.prompt,
    });
    setEditingId(version.id);
    setShow(true);
  }
  async function remove() {
    try {
      setBusy(true);
      await api(`/prompt-versions/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await refresh();
      setNote("Черновик удалён.");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }
  function openNewVersion() {
    setForm({ name: "", agent: "recruiter", prompt: "" });
    setEditingId(null);
    setShow(true);
  }
  async function importPrompt(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200 * 1024) {
      setNote(
        "Файл промпта больше 200 КБ. Проверьте, что выбран экспорт промпта, а не база знаний.",
      );
      return;
    }
    try {
      const text = await file.text();
      const payload = file.name.toLowerCase().endsWith(".json")
        ? JSON.parse(text)
        : { systemPrompt: text };
      if (payload.format === 'prompt-lab-agent-package') {
        const preview = await api('/agent-package/preview', { method: 'POST', body: payload });
        setPackagePreview({ fileName: file.name, payload, ...preview });
        setPackageAgent("__create_from_package__");
        setNote('Паспорт проверен. Импорт создаст локальную копию агента и её исходную версию промпта без тестовых кейсов.');
        return;
      }
      if (payload.scope && payload.scope !== "prompt")
        throw Error(
          "Этот экспорт содержит не только промпт. Загрузите экспорт со scope: prompt.",
        );
      const prompt =
        payload.systemPrompt || payload.system_prompt || payload.prompt || text;
      if (typeof prompt !== "string" || !prompt.trim())
        throw Error(
          "В файле не найден системный промпт: ожидается поле systemPrompt.",
        );
      const exported = payload.exportedAt
        ? new Date(payload.exportedAt).toLocaleDateString("ru-RU")
        : "импорт";
      setForm({
        name: payload.name || `Импорт промпта · ${exported}`,
        agent: payload.agent === "recruiter" ? "recruiter" : "sales",
        prompt: prompt.trim(),
      });
      setEditingId(null);
      setShow(true);
      setNote(
        "Промпт импортирован в черновик. Проверьте текст перед сохранением.",
      );
    } catch (error) {
      setNote(error.message || "Не удалось прочитать экспорт промпта.");
    }
  }
  async function applyPackage() {
    if (!packagePreview || !packageAgent) return;
    try {
      setBusy(true);
      const result = await api('/agent-package/import', { method: 'POST', body: { package: packagePreview.payload, targetAgentId: packageAgent } });
      setPackagePreview(null);
      await refresh();
      setNote(packageAgent === "__create_from_package__" ? `Создан агент «${result.agent.name}» и его черновик с планом eval.` : 'Создан черновик выбранного агента с планом eval. Добавьте тестовые кейсы отдельно.');
    } catch (error) {setNote(error.message);} finally {setBusy(false);}
  }
  return (
    <Page
      eyebrow="ВЕРСИИ ПРОМПТОВ"
      title={
        <>
          Каждая правка
          <br />
          <em>имеет историю.</em>
        </>
      }
      action={
        canChange && (
          <div className="header-actions">
            <input
              ref={promptFileInput}
              className="visually-hidden"
              type="file"
              accept=".json,application/json,.txt,text/plain,.md,text/markdown"
              onChange={importPrompt}
            />
            <button
              className="ghost"
              onClick={() => promptFileInput.current?.click()}
            >
              Импорт паспорта агента
            </button>
            <button className="primary" onClick={openNewVersion}>
              + Новая версия
            </button>
          </div>
        )
      }
    >
      <Notice>{note}</Notice>
      {packagePreview && <section className="agent-package-preview" aria-label="Предпросмотр паспорта агента"><p className="eyebrow">ПАСПОРТ АГЕНТА · ЛОКАЛЬНАЯ КОПИЯ</p><h2>Импорт {packagePreview.summary.agent}</h2><dl><div><dt>Файл</dt><dd>{packagePreview.fileName}</dd></div><div><dt>Название агента</dt><dd>{packagePreview.summary.agent}</dd></div><div><dt>Операция</dt><dd>{packagePreview.summary.operation}</dd></div><div><dt>Языки</dt><dd>{packagePreview.summary.languages.join(' · ')}</dd></div><div><dt>Критерии eval</dt><dd>{packagePreview.summary.criteria.join(' · ')}</dd></div><div><dt>Промпт</dt><dd>{packagePreview.promptLength} символов</dd></div></dl><p>После импорта появится новая локальная копия «{packagePreview.summary.agent}» с исходной версией промпта. Реальный агент не меняется; тестовые пары добавляются следующим шагом.</p><div className="agent-package-preview-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setPackagePreview(null)}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={applyPackage}>{busy ? 'Импортируем…' : 'Создать копию из паспорта'}</button></div></section>}
      {setupVersion && (
        <EvaluationReadiness
          version={setupVersion}
          agent={agentItems.find((agent) => agent.id === setupVersion.agent)}
          status={setup.data}
          onEdit={() => edit(setupVersion)}
          onOpen={(target) => setTab(target)}
          onClose={() => setSetupVersion(null)}
        />
      )}
      {show && (
        <form className="editor" onSubmit={create}>
          <div className="editor-heading">
            <div>
              <p className="eyebrow">
                {editingId ? "РЕДАКТИРОВАНИЕ ЧЕРНОВИКА" : "НОВЫЙ ЧЕРНОВИК"}
              </p>
              <h2>{editingId ? "Корректировка версии" : "Новая версия"}</h2>
            </div>
            <button
              type="button"
              className="ghost compact"
              onClick={() => {
                setShow(false);
                setEditingId(null);
              }}
            >
              Закрыть
            </button>
          </div>
          <label>
            Название
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Агент
            <select
              value={form.agent}
              onChange={(e) => setForm({ ...form, agent: e.target.value })}
            >
              {agentItems.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Кандидатный промпт
            <textarea
              required
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy
              ? "Сохраняем…"
              : editingId
                ? "Сохранить изменения"
                : "Сохранить черновик"}
          </button>
        </form>
      )}
      {versionItems.length > 0 && <section className="version-story-intro">
        <div><p className="eyebrow">ЛИНИЯ РАЗВИТИЯ</p><h2>{selectedAgent?.name || "Промпты лаборатории"}</h2><p>Один исходный промпт, отдельные кандидаты и сохранённые результаты их проверок.</p></div>
        <div className="version-story-best"><span>Лучшая проверенная версия</span><b>{bestVersion ? `${bestVersion.datasetEvaluation.holdout.score}/10` : "—"}</b><small>{bestVersion ? "независимый holdout" : "пока нет holdout-проверки"}</small></div>
      </section>}
      <div className="versions version-timeline">
        {versionItems.map((v, index) => (
          <article key={v.id} className={`version-card version-step ${bestVersion?.id === v.id ? "is-best" : ""}`}>
            <div className="version-heading">
              <span className={"status " + v.status}>{v.status}</span>
              <p className="version-stage">{generation(v) === 0 ? "Исходная версия" : `Итерация улучшения · ${generation(v)}`}</p>
              <h2 title={v.name}>{generation(v) === 0 ? "Базовый промпт" : `Кандидат ${generation(v)}`}</h2>
              <p>
                {agentNames[v.agent] || "Удалённый агент"} ·{" "}
                {new Date(v.createdAt).toLocaleDateString("ru-RU")} · этап {versionItems.length - index}
              </p>
            </div>
            <div className="version-metrics">
              <b>
                {v.quality ?? "—"}
                <small>% качество</small>
              </b>
              <p>
                JSON {v.json ?? "—"}% · ограничения {v.guardrails ?? "—"}%
              </p>
            </div>
            <div className="version-summary">
              <p>{summarizeDiff(v.diff)}{String(v.diff || "").length > 150 ? "…" : ""}</p>
              <button
                type="button"
                className="detail-link"
                aria-expanded={openDetail === `${v.id}:diff`}
                aria-controls={`version-diff-${v.id}`}
                onClick={() => setOpenDetail((current) => current === `${v.id}:diff` ? "" : `${v.id}:diff`)}
              >
                Что изменилось {openDetail === `${v.id}:diff` ? "−" : "+"}
              </button>
            </div>
            <div className="actions version-actions">
              {v.status === "draft" && canChange && (
                <>
                  <button
                    className="icon-button"
                    title="Редактировать черновик"
                    aria-label={`Редактировать «${v.name}»`}
                    onClick={() => edit(v)}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-button danger-hover"
                    title="Удалить черновик"
                    aria-label={`Удалить «${v.name}»`}
                    onClick={() => setDeleteTarget(v)}
                  >
                    <svg
                      className="trash-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13" />
                    </svg>
                  </button>
                </>
              )}
              {v.status === "draft" && canChange && (
                <button
                  className="primary"
                  onClick={() => action(v.id, "test")}
                >
                  Тестировать
                </button>
              )}
              {v.status === "tested" && (
                canChange && (
                  <>
                    {!v.lastEval?.judge && (
                      <button
                        className="ghost"
                        disabled={Boolean(actionBusy)}
                        onClick={() => action(v.id, "judge")}
                      >
                        {actionBusy === `${v.id}:judge` ? "Оцениваем…" : "Независимая оценка"}
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={Boolean(actionBusy)}
                      onClick={() => action(v.id, "improve")}
                    >
                      {actionBusy === `${v.id}:improve` ? "Улучшаем…" : "Улучшить промпт"}
                    </button>
                  </>
                )
              )}
            </div>
            {openDetail === `${v.id}:diff` && (
              <section id={`version-diff-${v.id}`} className="version-detail">
                <p className="eyebrow">ИЗМЕНЕНИЯ В ВЕРСИИ</p>
                <pre>{v.diff}</pre>
                {v.evalPlan && <p className="agent-eval-plan">План eval: {v.evalPlan.evaluation.criteria.join(' · ')}.</p>}
              </section>
            )}
            {v.lastEval && (
              <section className="eval-result-accordion version-detail-accordion">
                <button
                  type="button"
                  className="eval-result-trigger"
                  aria-expanded={openDetail === `${v.id}:result`}
                  aria-controls={`eval-result-${v.id}`}
                  onClick={() => setOpenDetail((current) => current === `${v.id}:result` ? "" : `${v.id}:result`)}
                >
                  <span>Результат проверки</span>
                  <span aria-hidden="true">{openDetail === `${v.id}:result` ? "−" : "+"}</span>
                </button>
                {openDetail === `${v.id}:result` && (
                  <div id={`eval-result-${v.id}`} className="eval-result-content">
                    <p><b>Решение:</b> {v.lastEval.result?.decision || "не определено"}</p>
                    <p><b>Оценка агента:</b> {v.lastEval.result?.score ?? "не рассчитана"}/10</p>
                    {v.lastEval.judge && <p><b>Независимая оценка:</b> {v.lastEval.judge.score}/10 · {v.lastEval.judge.decision || "решение не указано"}</p>}
                    {v.lastEval.judge && <p><b>Соблюдение ограничений:</b> {v.lastEval.judge.no_invention === true ? "подтверждено" : v.lastEval.judge.no_invention === false ? "есть нарушение" : "не определено"}</p>}
                    {v.lastEval.judge?.reasoning && <p><b>Комментарий оценщика:</b> {v.lastEval.judge.reasoning}</p>}
                    {Array.isArray(v.lastEval.result?.strengths) && v.lastEval.result.strengths.length > 0 && <p><b>Сильные стороны:</b> {v.lastEval.result.strengths.join("; ")}</p>}
                    {Array.isArray(v.lastEval.result?.gaps) && v.lastEval.result.gaps.length > 0 && <p><b>Пробелы:</b> {v.lastEval.result.gaps.join("; ")}</p>}
                    {Array.isArray(v.lastEval.result?.missing_information) && v.lastEval.result.missing_information.length > 0 && <p><b>Не хватает данных:</b> {v.lastEval.result.missing_information.join("; ")}</p>}
                  </div>
                )}
              </section>
            )}
          </article>
        ))}
      </div>
      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-version-title"
          >
            <p className="eyebrow">УДАЛЕНИЕ ЧЕРНОВИКА</p>
            <h3 id="delete-version-title">Удалить «{deleteTarget.name}»?</h3>
            <p>
              Черновик будет удалён без возможности восстановления. История
              протестированных и опубликованных версий не затрагивается.
            </p>
            <div>
              <button className="ghost" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Удаляем…" : "Удалить черновик"}
              </button>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
function EvaluationReadiness({
  version,
  agent,
  status,
  onEdit,
  onOpen,
  onClose,
}) {
  if (!agent)
    return (
      <section className="eval-readiness" aria-labelledby="eval-readiness-title">
        <div>
          <p className="eyebrow">СВЯЗЬ С АГЕНТОМ ПОТЕРЯНА</p>
          <h2 id="eval-readiness-title">Эту версию нельзя проверить</h2>
          <p>
            Агент, к которому была привязана версия «{version.name}», уже
            удалён. Перепривяжите черновик к существующему агенту или удалите
            его и импортируйте паспорт заново.
          </p>
        </div>
        <div className="readiness-actions">
          <button className="primary" onClick={onEdit}>
            Перепривязать версию
          </button>
          <button className="ghost" onClick={onClose}>Закрыть</button>
        </div>
      </section>
    );
  const isSales = agent?.kind === "sales";
  const ready = isSales
    ? Boolean(
        status?.openaiConfigured &&
        status?.sales?.profiles &&
        status?.sales?.scenarios,
      )
    : Boolean(
        status?.openaiConfigured &&
        status?.recruiter?.cases >= status?.recruiter?.minimumCases,
      );
  const requirements = isSales
    ? [
        ["Ключ OpenAI", Boolean(status?.openaiConfigured), "admin"],
        ["Профиль продаж", Boolean(status?.sales?.profiles), "simulations"],
        ["Сценарий диалога", Boolean(status?.sales?.scenarios), "simulations"],
      ]
    : [
        ["Ключ OpenAI", Boolean(status?.openaiConfigured), "admin"],
        [
          `Тестовые кейсы (минимум ${status?.recruiter?.minimumCases || 5})`,
          (status?.recruiter?.cases || 0) >=
            (status?.recruiter?.minimumCases || 5),
          "datasets",
        ],
      ];
  return (
    <section className="eval-readiness" aria-labelledby="eval-readiness-title">
      <div>
        <p className="eyebrow">ПОДГОТОВКА ПРОВЕРКИ</p>
        <h2 id="eval-readiness-title">Что нужно для запуска</h2>
        <p>
          Версия «{version.name}» относится к «
          {agent?.name || "удалённому агенту"}».
          {ready
            ? " Всё готово: закройте этот блок и нажмите «Тестировать» ещё раз."
            : " Выполните незавершённые шаги — данные и ключ не подставляются автоматически."}
        </p>
      </div>
      <ul>
        {requirements.map(([label, done]) => (
          <li className={done ? "done" : ""} key={label}>
            <span aria-hidden="true">{done ? "✓" : "○"}</span>
            {label} <small>{done ? "готово" : "нужно добавить"}</small>
          </li>
        ))}
      </ul>
      <div className="readiness-actions">
        <button className="ghost" onClick={onEdit}>
          Изменить агента
        </button>
        {requirements
          .filter(([, done]) => !done)
          .map(([, , target], index) =>
            target === "admin" ? (
              <a
                className="ghost"
                href="/admin"
                target="_blank"
                rel="noreferrer"
                key={`${target}-${index}`}
              >
                Открыть Admin ↗
              </a>
            ) : (
              <button
                className="primary"
                onClick={() => onOpen(target)}
                key={`${target}-${index}`}
              >
                {target === "datasets"
                  ? "Открыть тестовые наборы"
                  : "Открыть симуляции"}
              </button>
            ),
          )}
        <button className="ghost" onClick={onClose}>
          {ready ? "Готово" : "Закрыть"}
        </button>
      </div>
    </section>
  );
}
function Evals({ setTab }) {
  const resource = useResource("/evaluations");
  const data = resource.data;
  return (
    <Page
      eyebrow="ПРОВЕРКИ И УЛУЧШЕНИЯ"
      title={
        <>
          Проверки, которые
          <br />
          <em>можно объяснить.</em>
        </>
      }
    >
      <section className="panel">
        <h2>Журнал запусков</h2>
        {resource.status === "loading" ? (
          <p className="empty">Загружаем фактические результаты запусков…</p>
        ) : resource.status === "error" ? (
          <div className="inline-error">
            <p>{resource.error.message}</p>
            <button className="ghost" onClick={resource.retry}>
              Повторить загрузку
            </button>
          </div>
        ) : data.items.length ? (
          <div className="eval-journal">
            {data.items.map((x) => (
              <article className="eval-entry" key={x.id}>
                {x.type === "dataset" ? <>
                  <div><p className="eyebrow">ПАКЕТНАЯ ПРОВЕРКА</p><b>{x.versionName}</b><small>{x.datasetName} · {new Date(x.createdAt).toLocaleString("ru-RU")}</small></div>
                  <div className="eval-score"><span>Итерации</span><b>{x.iteration.score ?? "—"}/10</b><small>JSON {x.iteration.validJson}% · ограничения {x.iteration.guardrails ?? "—"}%</small></div>
                  <div className="eval-score holdout"><span>Holdout</span><b>{x.holdout.score ?? "—"}/10</b><small>{x.holdout.cases} кейс. · JSON {x.holdout.validJson}% · ограничения {x.holdout.guardrails ?? "—"}%</small></div>
                  <small className="eval-tokens">{x.tokens.toLocaleString("ru-RU")} токенов</small>
                </> : <>
                  <div><p className="eyebrow">ПРОБНЫЙ ЗАПУСК</p><b>{x.type === "holdout" ? "Независимая проверка" : "Проверка одного кейса"}</b><small>{new Date(x.createdAt).toLocaleString("ru-RU")}</small></div>
                  <small className="eval-tokens">{x.tokens || 0} токенов</small>
                </>}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-action"><p className="empty">Проверок пока нет. Создайте набор и запустите тест версии.</p><button className="ghost" onClick={()=>setTab("versions")}>Открыть версии промптов →</button></div>
        )}
        <h2>Предложения по улучшению</h2>
        {data?.proposals?.length ? data.proposals.map((p) => (
          <article className="proposal" key={p.id}>
            <p>Кандидатная версия подготовлена {new Date(p.createdAt).toLocaleString("ru-RU")}.</p>
          </article>
        )) : <p className="note">Автоматических предложений пока нет. Они появятся после создания улучшенной версии.</p>}
      </section>
    </Page>
  );
}
function Admin() {
  const [conf, setConf] = useState(null),
    [key, setKey] = useState(""),
    [replacingKey, setReplacingKey] = useState(false),
    [models, setModels] = useState([]),
    [catalog, setCatalog] = useState([]),
    [modelCheck, setModelCheck] = useState(null),
    [integration, setIntegration] = useState(null),
    [note, setNote] = useState(""),
    [loadError, setLoadError] = useState(""),
    keyInput = useRef(null);
  const loadSettings = () => {
    setLoadError("");
    return Promise.all([api("/settings/admin"), api("/settings/integration")])
      .then(([c, i]) => {
        setConf(c);
        setIntegration(i);
        setModels(c.models);
        setCatalog(c.availableModels || []);
      })
      .catch((error) => setLoadError(error.message));
  };
  useEffect(() => {
    loadSettings();
  }, []);
  useEffect(() => {
    if (key) return;
    const clearAutofill = () => {
      if (keyInput.current) keyInput.current.value = "";
    };
    clearAutofill();
    const timer = window.setTimeout(clearAutofill, 180);
    return () => window.clearTimeout(timer);
  }, [key, conf?.apiKeySaved]);
  if (!conf)
    return (
      <main className="main">
        <StatePanel
          title={
            loadError ? "Не удалось открыть админку" : "Открываем админку…"
          }
          retry={loadError ? loadSettings : undefined}
        >
          {loadError ||
            "Проверяем права доступа и загружаем настройки, ключи не показываются в браузере."}
        </StatePanel>
      </main>
    );
  async function save() {
    try {
      let c = await api("/settings/admin", {
        method: "PUT",
        body: { apiKey: key, models },
      });
      setConf(c);
      setKey("");
      setReplacingKey(false);
      setNote(
        "Настройки модели сохранены на сервере. Ключ не возвращается в браузер.",
      );
    } catch (e) {
      setNote(e.message);
    }
  }
  async function refresh() {
    try {
      let x = await api("/settings/models/refresh", { method: "POST" });
      setCatalog(x.items);
      setNote(
        `Каталог обновлён через OpenAI: доступно ${x.items.length} моделей для этого ключа.`,
      );
    } catch (e) {
      setNote(e.message);
    }
  }
  async function checkModels() {
    try {
      const result = await api("/settings/models/check", { method: "POST", body: { models } });
      setModelCheck(result);
    } catch (e) {
      setNote(e.message);
    }
  }
  async function saveIntegration() {
    try {
      setIntegration(
        await api("/settings/integration", {
          method: "PUT",
          body: integration,
        }),
      );
      setNote("Адаптер салона сохранён. Рабочий агент не менялся.");
    } catch (e) {
      setNote(e.message);
    }
  }
  const modelOptions = Array.from(
    new Map(
      [...catalog, ...Object.values(models || {})]
        .filter(Boolean)
        .map((model) => [typeof model === "string" ? model : model.id, model]),
    ).values(),
  ).map((model) =>
    typeof model === "string"
      ? { id: model, label: model }
      : { id: model.id, label: model.label || model.id },
  );
  return (
    <Page
      eyebrow="АДМИНКА · LLM И ИНТЕГРАЦИЯ"
      title={
        <>
          Настройки
          <br />
          <em>лаборатории.</em>
        </>
      }
    >
      <Notice>{note}</Notice>
      <section className="panel settings">
        <h2>OpenAI</h2>
        <p>
          Ключ вводится только администратором и хранится на сервере. Текущий
          статус: <b>{conf.apiKeySaved ? "сохранён" : "не задан"}</b>.
        </p>
        <div
          className={`key-control ${conf.apiKeySaved && !replacingKey ? "is-saved" : ""}`}
        >
          <label>
            Ключ OpenAI API
            <input
              ref={keyInput}
              type="password"
              name="promptlab-openai-api-key"
              autoComplete="new-password"
              data-1p-ignore="true"
              value={key}
              disabled={conf.apiKeySaved && !replacingKey}
              onChange={(e) => setKey(e.target.value)}
              onFocus={(e) => {
                if (!key) e.currentTarget.value = "";
              }}
              placeholder={
                conf.apiKeySaved && !replacingKey
                  ? "✓ Ключ сохранён на сервере"
                  : "sk-…"
              }
            />
          </label>
          {conf.apiKeySaved && !replacingKey && (
            <button
              type="button"
              className="ghost key-replace"
              onClick={() => {
                setReplacingKey(true);
                window.setTimeout(() => keyInput.current?.focus(), 0);
              }}
            >
              Заменить ключ
            </button>
          )}
        </div>
        <small className={`key-hint ${conf.apiKeySaved ? "saved" : ""}`}>
          {conf.apiKeySaved && !replacingKey
            ? `Ключ сохранён на сервере${conf.apiKeySource === "environment" ? " через защищённую переменную окружения" : " в зашифрованном локальном хранилище"}. Сам ключ не отображается в браузере.`
            : replacingKey
              ? "Введите новый ключ и сохраните LLM-настройки. Старый ключ будет заменён только после успешного сохранения."
              : "Ключ ещё не сохранён. После ввода он маскируется точками и не возвращается из сервера."}
        </small>
        <button className="ghost" onClick={refresh}>
          Обновить каталог моделей
        </button>
        <div className="modelgrid">
          {[
            ["worker", "Рабочая модель"],
            ["gold", "Эталонная модель"],
            ["judge", "Модель‑оценщик"],
          ].map(([x, l]) => (
            <label key={x}>
              {l}
              <select
                value={models[x]}
                onChange={(e) => setModels({ ...models, [x]: e.target.value })}
              >
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <small className="key-hint">
          Список упорядочен по названию, а не по мощности: OpenAI API не
          отдаёт универсальный рейтинг моделей. Выбирайте по роли: рабочая —
          баланс цены и скорости, эталонная и оценщик — более сильные модели.
        </small>
        {models.gold === models.judge && (
          <small className="key-hint">
            Эталонная модель и модель-оценщик совпадают. Это работает, но для более независимой оценки лучше выбрать разные модели.
          </small>
        )}
        <div className="model-check-actions">
          <button type="button" className="ghost" onClick={checkModels}>
            Проверить конфигурацию моделей
          </button>
          {modelCheck && (
            <section className={`model-check ${modelCheck.ok ? "ok" : "warning"}`}>
              <b>{modelCheck.ok ? "Конфигурация выглядит согласованной" : "Есть риск в иерархии моделей"}</b>
              {modelCheck.issues.map((issue) => <p key={issue}>{issue}</p>)}
              <p>{modelCheck.note}</p>
              {!modelCheck.ok && modelCheck.canRecommend && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setModels(modelCheck.recommended);
                    setNote("Рекомендация подставлена. Проверьте её и сохраните LLM-настройки.");
                  }}
                >
                  Подставить рекомендацию
                </button>
              )}
            </section>
          )}
        </div>
        <button className="primary" onClick={save}>
          Сохранить LLM‑настройки
        </button>
      </section>
      {integration && (
        <section className="panel settings">
          <h2>Адаптер AI‑администратора салона</h2>
          <label>
            Режим
            <select
              value={integration.mode}
              onChange={(e) =>
                setIntegration({ ...integration, mode: e.target.value })
              }
            >
              <option value="both">API и безопасный экспорт</option>
              <option value="api">Только API</option>
              <option value="export">Только экспорт</option>
            </select>
          </label>
          <label>
            Публичный HTTPS API
            <input
              value={integration.apiUrl}
              onChange={(e) =>
                setIntegration({ ...integration, apiUrl: e.target.value })
              }
              placeholder="https://api.example.com"
            />
          </label>
          <label>
            Описание безопасного экспорта
            <textarea
              value={integration.exportSummary}
              onChange={(e) =>
                setIntegration({
                  ...integration,
                  exportSummary: e.target.value,
                })
              }
            />
          </label>
          <button className="primary" onClick={saveIntegration}>
            Сохранить адаптер
          </button>
        </section>
      )}
    </Page>
  );
}
function Developer({ demo, setDemo }) {
  const [data, setData] = useState(null),
    [form, setForm] = useState({
      name: "",
      publicUrl: "",
      host: "",
      installPath: "",
      environment: "production",
      sshSecret: "",
    }),
    [note, setNote] = useState(""),
    [demoForm, setDemoForm] = useState(demo),
    [selectedId, setSelectedId] = useState(""),
    [editing, setEditing] = useState(false),
    [removeTarget, setRemoveTarget] = useState(null),
    [publishTarget, setPublishTarget] = useState(null),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    api("/developer/publication/profiles").then((next) => {
      setData(next);
      setSelectedId((current) => current || next.items[0]?.id || "");
      return next;
    });
  useEffect(() => {
    refresh();
    api("/developer/demo-mode").then((x) => {
      setDemo(x);
      setDemoForm(x);
    });
  }, []);
  async function saveDemo(e) {
    e.preventDefault();
    try {
      let r = await api("/developer/demo-mode", {
        method: "PUT",
        body: demoForm,
      });
      setDemo(r);
      setDemoForm(r);
      setNote(
        r.enabled
          ? "Демо-режим сохранён и активен."
          : "Демо-режим сохранён и выключен: действуют обычные правила доступа.",
      );
    } catch (e) {
      setNote(e.message);
    }
  }
  async function save(e) {
    e.preventDefault();
    try {
      setBusy(true);
      await api(
        `/developer/publication/profiles/${selectedId || crypto.randomUUID()}`,
        { method: "PUT", body: form },
      );
      setNote("Профиль публикации сохранён. Секрет не возвращается в браузер.");
      const next = await refresh();
      setSelectedId(selectedId || next.items.at(-1)?.id || "");
      setEditing(false);
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(p) {
    try {
      let r = await api(`/developer/publication/${p.id}/prepare`, {
        method: "POST",
      });
      setNote(r.run.detail);
      refresh();
    } catch (e) {
      setNote(e.message);
    }
  }
  async function publishPlan() {
    try {
      setBusy(true);
      await api(`/developer/publication/${publishTarget.id}/publish`, {
        method: "POST",
      });
      setPublishTarget(null);
      await refresh();
    } catch (e) {
      setNote(e.message);
      setPublishTarget(null);
    } finally {
      setBusy(false);
    }
  }
  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(selected.publicUrl);
      setNote("Публичный адрес скопирован.");
    } catch {
      setNote("Не удалось скопировать адрес: используйте ссылку рядом.");
    }
  }
  function newProfile() {
    setSelectedId("");
    setForm({
      name: "",
      publicUrl: "",
      host: "",
      installPath: "",
      environment: "production",
      sshSecret: "",
    });
    setEditing(true);
  }
  function editProfile(profile) {
    setSelectedId(profile.id);
    setForm({ ...profile, sshSecret: "" });
    setEditing(true);
  }
  async function removeProfile() {
    try {
      setBusy(true);
      await api(`/developer/publication/profiles/${removeTarget.id}`, {
        method: "DELETE",
      });
      setRemoveTarget(null);
      setSelectedId("");
      await refresh();
      setNote("Профиль публикации удалён.");
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }
  const flag = (key, label, description) => (
    <label className="demoflag" key={key}>
      <input
        type="checkbox"
        checked={Boolean(demoForm[key])}
        onChange={(e) => setDemoForm({ ...demoForm, [key]: e.target.checked })}
      />
      <span>
        <b>{label}</b>
        <small>{description}</small>
      </span>
    </label>
  );
  const capabilities = {
    agents: "Агенты",
    datasets: "Тестовые наборы",
    simulations: "Симуляции",
    versions: "Версии промптов",
    evaluations: "Проверки",
    analytics: "Аналитика",
  };
  const selected = data?.items.find((item) => item.id === selectedId) || null;
  const activeRun =
    data?.runs.find((run) => run.profileId === selectedId) || null;
  const lastRun = data?.runs[0] || null;
  return (
    <Page eyebrow="КОНСОЛЬ РАЗРАБОТЧИКА · SERVER ONLY" title="Публикация">
      <Notice>{note}</Notice>
      <section id="demo-mode" className="panel publication">
        <p className="eyebrow">ДЕМО-РЕЖИМ</p>
        <h2>{demo.enabled ? "Демо-режим включён" : "Демо-режим выключен"}</h2>
        <p>
          Эта конфигурация действует только после явного сохранения. При
          выключении публичный доступ и пароль 1234 немедленно перестают
          работать.
        </p>
        <form className="demoform" onSubmit={saveDemo}>
          {flag(
            "enabled",
            "Включить демо-режим",
            "Открывает только отмеченные ниже возможности.",
          )}
          <details className="platform-accordion">
            <summary className="platform-accordion-trigger">
              Дополнительные возможности демо-режима
            </summary>
            <div className="platform-accordion-content">
              <fieldset disabled={!demoForm.enabled}>
                {flag(
                  "publicHome",
                  "Публичный доступ к главной странице",
                  "Без учётной записи, логина и пароля.",
                )}
                {flag(
                  "adminPassword",
                  "Демо-доступ к административной странице",
                  "Только через отдельный пароль 1234.",
                )}
                {flag(
                  "fullAccess",
                  "Полный доступ к функциям агента",
                  "Без лимитов, квот, кредитов и урезания возможностей.",
                )}
                <p className="eyebrow">РАЗДЕЛЫ ДЕМОНСТРАЦИИ</p>
                {Object.entries(capabilities).map(([key, label]) => (
                  <label className="demoflag" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(demoForm.capabilities?.[key])}
                      onChange={(e) =>
                        setDemoForm({
                          ...demoForm,
                          capabilities: {
                            ...demoForm.capabilities,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      <b>{label}</b>
                      <small>Доступно посетителю в демо-режиме.</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
          <button className="primary">Сохранить демо-конфигурацию</button>
        </form>
      </section>
      <section id="publication" className="panel publication">
        <p className="eyebrow">ПОДГОТОВКА ВЫПУСКА</p>
        <h2>Публикация агента</h2>
        <p className="publication-intro">
          Выберите защищённый профиль, проверьте состав выпуска и подготовьте
          план. Запуск на сервер не выполняется без отдельного подтверждения.
        </p>
        <div className="publication-toolbar">
          <label>
            Профиль публикации
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={!data?.items.length}
            >
              {data?.items.length ? (
                data.items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option>Профили ещё не созданы</option>
              )}
            </select>
          </label>
          <div className="publication-actions">
            <button
              className="ghost"
              disabled={!selected}
              onClick={() => editProfile(selected)}
              aria-label="Редактировать профиль"
            >
              ✎
            </button>
            <button
              className="ghost danger"
              disabled={!selected}
              onClick={() => setRemoveTarget(selected)}
              aria-label="Удалить профиль"
            >
              ⌫
            </button>
            <button className="ghost" onClick={newProfile}>
              + Новый профиль
            </button>
          </div>
        </div>
        {selected && (
          <div className="profile-summary">
            <span>
              <b>
                {selected.environment === "production"
                  ? "Боевая среда"
                  : selected.environment}
              </b>
              <small>{selected.publicUrl}</small>
            </span>
            <span>
              <b>Секрет SSH</b>
              <small>
                {selected.secretSaved ? "сохранён на сервере" : "не добавлен"}
              </small>
            </span>
          </div>
        )}
        {editing && (
          <form className="publication-editor" onSubmit={save}>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">
                  {selected ? "РЕДАКТИРОВАНИЕ" : "НОВЫЙ ПРОФИЛЬ"}
                </p>
                <h3>{selected ? selected.name : "Параметры нового профиля"}</h3>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="deployform">
              {[
                ["name", "Название профиля", "Понятное имя для этого контура."],
                [
                  "publicUrl",
                  "Публичный HTTPS‑адрес",
                  "Адрес будущей проверки после выпуска.",
                ],
                [
                  "host",
                  "Хост / IP",
                  "Цель развёртывания, не показывается посетителям.",
                ],
                [
                  "installPath",
                  "Изолированный путь установки",
                  "Отдельный путь без перезапуска соседних сервисов.",
                ],
              ].map(([key, label, hint]) => (
                <label key={key}>
                  {label}
                  <small>{hint}</small>
                  <input
                    required
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="secret-field">
              SSH‑секрет{" "}
              <small>
                Передаётся только в защищённый API и не возвращается в браузер.
              </small>
              <input
                type="password"
                value={form.sshSecret}
                onChange={(e) =>
                  setForm({ ...form, sshSecret: e.target.value })
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить профиль"}
            </button>
          </form>
        )}
        {selected && (
          <div className="release-facts">
            <div>
              <span>Состав выпуска</span>
              <b>React/Vite · Express API · Prisma/PostgreSQL</b>
            </div>
            <div>
              <span>Миграции</span>
              <b>Prisma migrate deploy</b>
            </div>
            <div>
              <span>Изоляция</span>
              <b>
                Отдельный Compose-проект; соседние сервисы не перезапускаются.
              </b>
            </div>
            <div>
              <span>Снимок версии</span>
              <b>
                {activeRun?.fingerprint ? (
                  <>
                    <code>{activeRun.fingerprint}</code> План подготовлен
                  </>
                ) : (
                  "Снимок ещё не подготовлен"
                )}
              </b>
            </div>
            <div>
              <span>Место на сервере</span>
              <b>
                <small>
                  Проверка станет доступна после подключения защищённого worker.
                </small>
              </b>
            </div>
            <div>
              <span>Публичный адрес</span>
              <b className="address-actions">
                <a href={selected.publicUrl} target="_blank" rel="noreferrer">
                  {selected.publicUrl}
                </a>
                <button
                  className="ghost compact"
                  onClick={copyPublicUrl}
                  aria-label="Скопировать публичный адрес"
                >
                  ⧉
                </button>
                <a
                  className="ghost compact"
                  href={selected.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Открыть публичный адрес"
                >
                  ↗
                </a>
              </b>
            </div>
          </div>
        )}
        <div className="release-plan">
          <p className="eyebrow">СОСТАВ ВЫПУСКА</p>
          <ol>
            {[
              [
                "Сборка",
                "React/Vite и Express API собираются в изолированный релиз.",
              ],
              [
                "Миграции",
                "Prisma migrate deploy выполняется до запуска приложения.",
              ],
              [
                "Развёртывание",
                "Отдельный Compose-проект не перезапускает соседние сервисы.",
              ],
              [
                "Проверка",
                "Health-check на цели и публичный HTTPS-проверка после выпуска.",
              ],
            ].map(([name, text]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="publish-footer">
          {selected ? (
            <>
              <span>
                Цель: <b>{selected.publicUrl}</b>
              </span>
              {activeRun?.status === "ready" ? (
                <button
                  className="primary"
                  onClick={() => setPublishTarget(activeRun)}
                >
                  Опубликовать
                </button>
              ) : (
                <button className="primary" onClick={() => prepare(selected)}>
                  Подготовить план
                </button>
              )}
            </>
          ) : (
            <span>Создайте профиль, чтобы подготовить план выпуска.</span>
          )}
        </div>
        {activeRun && (
          <div className="release">
            <b>План готов к запуску</b>
            <p>{activeRun.detail}</p>
            <div>
              {activeRun.stages.map((stage) => (
                <span className={stage.status} key={stage.id || stage}>
                  {stage.status === "completed" ? "✓" : "○"}
                  <small>{stage.label || stage}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        {lastRun && (
          <>
            <div className="last-release">
              <b>Последнее действие:</b>
              <span>
                {lastRun.status === "ready"
                  ? "План готов к запуску"
                  : lastRun.status}
              </span>
              <time>{new Date(lastRun.createdAt).toLocaleString("ru-RU")}</time>
            </div>
            <details className="safe-log">
              <summary>Безопасный журнал последнего действия</summary>
              <p>{lastRun.detail}</p>
              <p>
                Fingerprint: <code>{lastRun.fingerprint}</code>
              </p>
            </details>
          </>
        )}
        {publishTarget && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="delete-modal publish-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="publish-title"
            >
              <p className="eyebrow">ЗАПУСК ПУБЛИКАЦИИ</p>
              <h3 id="publish-title">
                Опубликовать на{" "}
                {selected?.environment === "production"
                  ? "боевой"
                  : selected?.environment}{" "}
                контур?
              </h3>
              <p>
                Будет запущен заранее настроенный server-side worker для{" "}
                <b>{selected?.publicUrl}</b>. После запуска интерфейс покажет
                фактические этапы и публичную HTTPS-проверку.
              </p>
              <div>
                <button
                  className="ghost"
                  onClick={() => setPublishTarget(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={publishPlan}
                >
                  {busy ? "Запускаем…" : "Опубликовать"}
                </button>
              </div>
            </section>
          </div>
        )}
        {removeTarget && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="delete-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-title"
            >
              <p className="eyebrow">УДАЛЕНИЕ ПРОФИЛЯ</p>
              <h3 id="delete-title">Удалить «{removeTarget.name}»?</h3>
              <p>
                Профиль и его сохранённый секрет станут недоступны для следующих
                выпусков. История подготовленных планов сохранится.
              </p>
              <div>
                <button className="ghost" onClick={() => setRemoveTarget(null)}>
                  Отмена
                </button>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={removeProfile}
                >
                  {busy ? "Удаляем…" : "Удалить профиль"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </Page>
  );
}
const tabBrand = {
  lab: {
    title: "iPrompt",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%2321685a'/%3E%3Cpath d='M32 14l4.6 12.8L50 32l-13.4 5.2L32 50l-4.6-12.8L14 32l13.4-5.2z' fill='%23fffefa'/%3E%3C/svg%3E",
  },
  admin: {
    title: "Admin",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%2321685a'/%3E%3Cpath d='M32 17a15 15 0 100 30 15 15 0 000-30zm0 8a7 7 0 110 14 7 7 0 010-14zM30 9h4l2 9h-8zM30 46h4l2 9h-8zM9 30h9v4H9zM46 30h9v4h-9z' fill='%23fffefa'/%3E%3C/svg%3E",
  },
  developer: {
    title: "Консоль",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='9' y='12' width='46' height='40' rx='8' fill='%2321685a'/%3E%3Cpath d='M28 24l-8 8 8 8m8 0l8-8-8-8M34 21l-5 22' fill='none' stroke='%23fffefa' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
  },
};
function getSurfaceFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return "admin";
  if (path === "/console" || path === "/developer") return "developer";
  const surface = new URLSearchParams(window.location.search).get("surface");
  return surface === "developer" || surface === "admin" ? surface : "lab";
}
function getLabTabFromLocation() {
  const allowed = new Set(["overview", "agents", "datasets", "simulations", "versions", "evals", "analytics"]);
  const hash = window.location.hash.replace(/^#/, "");
  return allowed.has(hash) ? hash : "overview";
}
function App() {
  const [user, setUser] = useState(null),
    [tab, setTab] = useState(getLabTabFromLocation),
    [selectedAgent, setSelectedAgent] = useState(null),
    [space, setSpace] = useState(getSurfaceFromLocation),
    [theme, setTheme] = useState(
      localStorage.getItem("promptlab-theme") || "light",
    ),
    [data, setData] = useState(null),
    [demo, setDemo] = useState({ enabled: false, capabilities: {} });
  const recoveringSession = useRef(false);
  const changeSpace = (next) => {
    const url = new URL(window.location.href);
    url.pathname =
      next === "admin" ? "/admin" : next === "developer" ? "/console" : "/";
    url.searchParams.delete("surface");
    window.history.replaceState({}, "", url);
    setSpace(next);
  };
  const refresh = () =>
    api("/overview")
      .then(setData)
      .catch(() => setUser(null));
  useEffect(() => {
    if (token)
      api("/auth/me")
        .then((x) => setUser(x.user))
        .catch(() => {
          token = "";
          localStorage.removeItem("promptlab-token");
        });
  }, []);
  useEffect(() => {
    const recoverSession = async () => {
      if (!user || recoveringSession.current) return;
      recoveringSession.current = true;
      resourceCache.clear();
      setData(null);
      try {
        if (user.isDemo) {
          const response = await fetch("/api/demo/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const restored = await response.json();
          if (!response.ok)
            throw Error(restored.error || "Демо-сессия недоступна.");
          token = restored.token;
          localStorage.setItem("promptlab-token", token);
          setUser(restored.user);
        } else {
          token = "";
          localStorage.removeItem("promptlab-token");
          setUser(null);
        }
      } catch {
        token = "";
        localStorage.removeItem("promptlab-token");
        setUser(null);
      } finally {
        recoveringSession.current = false;
      }
    };
    window.addEventListener("promptlab:auth-expired", recoverSession);
    return () =>
      window.removeEventListener("promptlab:auth-expired", recoverSession);
  }, [user]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("promptlab-theme", theme);
  }, [theme]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tab, space]);
  useEffect(() => {
    const syncTabFromHash = () => {
      if (getSurfaceFromLocation() === "lab") setTab(getLabTabFromLocation());
    };
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);
  useEffect(() => {
    let brand = tabBrand[space] || tabBrand.lab;
    document.title = brand.title;
    document.querySelector("#app-icon")?.setAttribute("href", brand.icon);
  }, [space]);
  useEffect(() => {
    if (user) {
      refresh();
      if (user.isDemo)
        fetch("/api/demo/status")
          .then((r) => r.json())
          .then(setDemo);
      else
        api("/developer/demo-mode")
          .then(setDemo)
          .catch(() => {});
    }
  }, [user]);
  if (space === "developer" && user?.isDemo) {
    token = "";
    localStorage.removeItem("promptlab-token");
    return <Login onLogin={setUser} space={space} />;
  }
  if (!user) return <Login onLogin={setUser} space={space} />;
  if (!data)
    return (
      <div className="boot">
        AI Prompt Lab<small>загружаем кабинет…</small>
      </div>
    );
  let body =
    space === "admin" ? (
      <Admin />
    ) : space === "developer" ? (
      <Developer {...{ demo, setDemo }} />
    ) : tab === "overview" ? (
      <Overview data={data} setTab={setTab} />
    ) : tab === "agents" ? (
      <Agents setTab={setTab} setSelectedAgent={setSelectedAgent} user={user} />
    ) : tab === "datasets" ? (
      <Datasets user={user} setTab={setTab} refresh={refresh} data={data} selectedAgent={selectedAgent} />
    ) : tab === "simulations" ? (
      <Simulations user={user} setTab={setTab} setSelectedAgent={setSelectedAgent} />
    ) : tab === "versions" ? (
      <Versions data={data} refresh={refresh} user={user} setTab={setTab} selectedAgent={selectedAgent} />
    ) : tab === "evals" ? (
      <Evals setTab={setTab} />
    ) : tab === "analytics" ? (
      <Analytics />
    ) : (
      <Overview data={data} setTab={setTab} />
    );
  return (
    <div className="shell">
      <Sidebar
        {...{
          tab,
          setTab,
          theme,
          setTheme,
          space,
          setSpace: changeSpace,
          user,
          demo,
        }}
      />
      {body}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
