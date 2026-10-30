import React,{useEffect,useState}from 'react';
import './analytics.css';

const request=(path)=>fetch(`/api${path}`,{headers:{Authorization:`Bearer ${localStorage.getItem('promptlab-token')||''}`}}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось получить аналитику.');return data});

export default function Analytics(){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  useEffect(()=>{request('/analytics').then(setData).catch(e=>setError(e.message))},[]);
  if(error)return <main className="main"><div className="notice">{error}</div></main>;
  if(!data)return <main className="main"><div className="panel">Загружаем аналитику…</div></main>;
  const {metrics,series=[],leads}=data;
  if(metrics.requests===0)return <main className="main"><header><div><p className="eyebrow">АНАЛИТИКА</p><h1>Реальные данные<br/><em>появятся здесь.</em></h1></div></header><section className="panel"><h2>Пока нет выполненных запусков</h2><p className="intro">Подключите ключ OpenAI, импортируйте конфигурацию агента и создайте первый тестовый набор. После фактического eval здесь появятся расходы, токены, время ответа и сравнение версий.</p></section></main>;
  return <main className="main">
    <header><div><p className="eyebrow">АНАЛИТИКА</p><h1>Метрики<br/><em>без магии.</em></h1></div></header>
    <p className="intro">Фактические результаты запусков, расход и сравнение версий на независимом наборе.</p>
    <section className="metrics">
      <article className="metric"><strong>{metrics.requests}</strong><span>Запросов</span><small>За всё время</small></article>
      <article className="metric"><strong>{metrics.tokens.toLocaleString('ru-RU')}</strong><span>Токенов</span><small>По всем моделям</small></article>
      <article className="metric"><strong>{metrics.costKnown?`${metrics.cost.toFixed(2)} $`:'—'}</strong><span>Расход</span><small>{metrics.costKnown?'Учтённые вызовы':'Тариф не рассчитан'}</small></article>
      <article className="metric"><strong>{metrics.latency===null?'—':`${metrics.latency} c`}</strong><span>Среднее время</span><small>{metrics.latency===null?'Нет замера в пакетах':'Ответа модели'}</small></article>
    </section>
    <section className="panel analytics-panel"><p className="eyebrow">НЕЗАВИСИМАЯ ПРОВЕРКА</p><h2>Качество версий на holdout</h2>{series.length?<div className="analytics-list">{series.map(v=><div key={v.label}><span>{v.label}</span><i><b style={{width:`${v.value}%`}}/></i><strong>{v.value}%</strong><small>{v.cases} кейс. · JSON {v.validJson}% · ограничения {v.guardrails}%</small></div>)}</div>:<p className="note">Пакетных проверок пока нет. Запустите «Проверить промпт» на сохранённом наборе.</p>}<p className="note">В сравнении используются только фактически сохранённые holdout-кейсы текущего набора.</p></section>
    <section className="panel"><p className="eyebrow">ЛИДЫ</p><h2>Сохранённые результаты диалогов</h2>{leads.length?<div className="table">{leads.map(lead=><article key={lead.id}><b>{lead.interest}</b><p>{lead.need} · {lead.nextStep}</p></article>)}</div>:<p className="note">Лидов пока нет. Они появятся после реальных или симулированных диалогов.</p>}</section>
  </main>;
}
