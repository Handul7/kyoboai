import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readPrototypeData, verifyPrototypeData } from '../scripts/verify-prototype.mjs';

const root = new URL('../', import.meta.url);
const [html, app, fixtures, research] = await Promise.all(['index.html', 'app.js', 'data.js', 'news-research.js'].map(file => readFile(new URL(file, root), 'utf8')));
const plain = value => JSON.parse(JSON.stringify(value));

/** Exercise actual view/permission/filter functions without a network or browser dependency. */
function ui() {
  const nodes = new Map();
  function node(selector = '') {
    if (!nodes.has(selector)) {
      const classes = new Set();
      const value = {
        innerHTML: '', textContent: '', hidden: false, open: false, value: '', dataset: {},
        classList: { add: (...items) => items.forEach(item => classes.add(item)), remove: (...items) => items.forEach(item => classes.delete(item)), contains: item => classes.has(item), toggle(item, force) { const next = force ?? !classes.has(item); next ? classes.add(item) : classes.delete(item); return next; } },
        setAttribute(name, content) { this[name] = String(content); },
        addEventListener() {}, focus() {}, scrollIntoView() {}, appendChild() {}, remove() {}, click() {}, contains() { return false; },
        showModal() { this.open = true; }, close() { this.open = false; },
        querySelector: name => node(`${selector} ${name}`), querySelectorAll: () => [],
      };
      nodes.set(selector, value);
    }
    return nodes.get(selector);
  }
  function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }; }
  const location = { hash: '', pathname: '/', origin: 'https://preview.example.test' };
  const context = vm.createContext({
    console, Date, Intl, URL, URLSearchParams, JSON, Set, Map,
    localStorage: storage(), sessionStorage: storage(), location,
    history: { pushState(_state, _title, hash) { location.hash = hash; }, replaceState(_state, _title, hash) { location.hash = hash; } },
    setTimeout: () => 1, clearTimeout() {},
    document: { body: node('body'), querySelector: selector => selector === 'dialog[open]' ? null : node(selector), querySelectorAll: () => [], getElementById: id => node(`#${id}`), addEventListener() {}, createElement: name => node(`created:${name}`) },
    window: { addEventListener() {}, scrollTo() {} },
    renderOperations() { context.operationsRendered = (context.operationsRendered || 0) + 1; },
  });
  vm.runInContext(`${fixtures}\n${research}\n${app}`, context);
  return { context, node, run: source => vm.runInContext(source, context) };
}

test('restored prototype includes two complete weeks and calendar-month evidence with explicit demo rights', async () => {
  const data = await readPrototypeData();
  const result = verifyPrototypeData(data);
  assert.equal(result.articles, 108);
  assert.equal(result.collections, 4);
  assert.equal(result.departmentReports, 24);
  assert.equal(result.monthlyReports, 12);
  assert.equal(data.pipeline.authorization.mode, 'client_demo');
  assert.equal(data.pipeline.authorization.serverEnforced, false);
});

test('revision date, presentation disclosure, reference tab, operations and original team credits coexist', () => {
  const revision = html.match(/class="revision-bar"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(revision, /최종 수정/);
  assert.match(revision, /<time\b[^>]*datetime="\d{4}-\d{2}-\d{2}/);
  assert.match(html, /id="implementation-note"/);
  for (const id of ['overview-tab', 'research-tab', 'operations-tab', 'overview-panel', 'research-panel', 'operations-panel']) assert.ok(html.includes(`id="${id}"`), `${id} is available`);
  assert.ok(html.indexOf('id="project-team-title"') < html.indexOf('class="process-tabs"'));
  for (const name of ['엘', '카밀라', '루트', '한들']) assert.ok(html.includes(`<dd>${name}</dd>`));
  for (const id of ['team-login-options', 'admin-login', 'logout-button']) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /og:title" content="희경 조장님 팟팅!/);
  assert.match(html, /og:image"[^>]+og-cheer-v1\.png/);
  assert.doesNotMatch(html, /id="department-tabs"/, 'All-news department filters must not return.');
});

test('guest starts in all-news; demo team selection cannot open another team and logout clears report content', () => {
  const page = ui();
  assert.equal(page.run('state.view'), 'news');
  page.run('setSession({role:"team",departmentId:"strategy"})');
  assert.equal(page.run('state.view'), 'departments');
  assert.equal(page.run('state.briefDepartment'), 'strategy');
  assert.deepEqual(plain(page.run('allowedDepartments().map(department=>department.id)')), ['strategy']);
  page.run('openPublication(REPORT_PUBLICATIONS.find(publication=>publication.departmentId==="risk").id)');
  assert.equal(page.run('state.briefDepartment'), 'strategy');
  assert.notEqual(page.run('state.view'), 'report');
  page.run('openPublication(REPORT_PUBLICATIONS.find(publication=>publication.departmentId==="strategy").id)');
  assert.equal(page.run('state.view'), 'report');
  assert.ok(page.node('#department-content').innerHTML.includes('report-document'));
  page.run('setSession(null)');
  assert.equal(page.run('state.view'), 'news');
  assert.equal(page.node('#department-content').innerHTML, '');
  assert.equal(page.run('state.publicationId'), null);
});

test('demo admin sees all teams; archive filters handle historical months and invalid date ranges', () => {
  const page = ui();
  page.run('setSession({role:"admin"})');
  assert.equal(page.run('state.view'), 'today');
  assert.equal(page.run('allowedDepartments().length'), 6);
  assert.equal(page.run('filteredReports("period").length'), 4);
  assert.equal(page.run('filteredReports("monthly").length'), 2);
  page.run('state.archiveMonth=MONTHLY_REPORTS[0].month');
  assert.equal(page.run('filteredReports("monthly").length'), 1);
  page.run('state.archiveFrom="2026-11-07";state.archiveTo="2026-10-01"');
  assert.equal(page.run('filteredReports("period").length'), 0);
  page.run('renderReportSelector()');
  assert.match(page.node('#report-selector').innerHTML, /종료일을 시작일 이후로/);
});

test('report document has one title, three content sections and compact clickable endnotes', () => {
  const page = ui();
  page.run('setSession({role:"team",departmentId:"product"});openPublication(REPORT_PUBLICATIONS.find(publication=>publication.departmentId==="product").id)');
  const output = page.node('#department-content').innerHTML;
  assert.equal((output.match(/<h1\b/g) || []).length, 1);
  assert.deepEqual([...output.matchAll(/<h2>(.*?)<\/h2>/g)].map(match=>match[1]), ['핵심 요약', '주요 인사이트', '분석 레포트', '뉴스 출처']);
  const header = output.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(header, /발행/);
  assert.match(header, /근거 뉴스/);
  assert.doesNotMatch(output, /분류 · 요약|뉴스 수집 범위|source-read|brief-stats/);
  assert.match(output, /<sup class="point-sources">[\s\S]*?data-source=/);
  assert.match(output, /class="source-title source-entry"[\s\S]*?data-article=/);
  page.run('openPublication(MONTHLY_PUBLICATIONS.find(publication=>publication.departmentId==="product").id)');
  assert.equal(page.run('publicationById(state.publicationId).kind'), 'monthly');
  assert.match(page.node('#department-content').innerHTML, /뉴스 출처/);
});

test('every presentation view distinguishes code, Jev judgment and LLM generation', () => {
  const page = ui();
  page.run('setSession({role:"admin"})');
  for (const view of ['news', 'today', 'departments', 'saved', 'process']) {
    page.run(`navigate(${JSON.stringify(view)},"strategy",false)`);
    const note = page.node('#implementation-note');
    assert.equal(note.hidden, false);
    for (const label of ['코딩', 'Jev', 'LLM']) assert.ok(note.innerHTML.includes(label), `${view} discloses ${label}`);
  }
});

test('new research and operational routes remain available after restoring old prototype navigation', () => {
  const page = ui();
  page.context.location.hash = '#process/news'; page.run('readHash()');
  assert.equal(page.run('state.view'), 'process');
  assert.equal(page.run('state.processTab'), 'news');
  assert.equal(page.node('#research-panel').hidden, false);
  assert.equal(page.node('#overview-panel').hidden, true);
  assert.equal(page.node('#operations-panel').hidden, true);
  page.context.location.hash = '#process/operations'; page.run('readHash()');
  assert.equal(page.run('state.processTab'), 'operations');
  assert.equal(page.node('#operations-panel').hidden, false);
  assert.ok(page.context.operationsRendered > 0);
});
