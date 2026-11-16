/*
 * ===================================================================
 *  app.js ―― 画面の動き（アプリ本体）
 * ===================================================================
 *  1件のタスクは、次のような形のデータです。
 *  {
 *    id:        'abc123',         // タスクごとの番号（自動で付きます）
 *    title:     '牛乳を買う',      // タスク名
 *    category:  'private',        // カテゴリ：'work'（仕事）/'private'（プライベート）
 *    due:       '2026-11-20',     // 期限（なしのときは null）
 *    priority:  'medium',         // 優先順位：'high' / 'medium' / 'low'
 *    done:      false,            // 完了したら true
 *    memo:      '',               // メモ
 *    createdAt: '...', updatedAt: '...', completedAt: null
 *  }
 * ===================================================================
 */

// ---------- 画面の状態 ----------
const state = {
  tasks: [],            // 全タスク
  category: 'work',     // 今開いているタブ
  filter: 'all',        // 今選んでいる絞り込み
  editingId: null,      // 編集中のタスクの id
};

const CATEGORY_LABELS = { work: '仕事', private: 'プライベート' };
const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ---------- よく使う画面の部品 ----------
const $ = (selector) => document.querySelector(selector);
const els = {
  tabs: document.querySelectorAll('.tab'),
  filters: document.querySelectorAll('#filters .chip'),
  addForm: $('#add-form'),
  addInput: $('#add-input'),
  list: $('#task-list'),
  empty: $('#empty'),
  summary: $('#summary'),
  dialog: $('#edit-dialog'),
  editForm: $('#edit-form'),
  editTitle: $('#edit-title'),
  editCategory: $('#edit-category'),
  editDue: $('#edit-due'),
  editPriority: $('#edit-priority'),
  editMemo: $('#edit-memo'),
  deleteButton: $('#delete-button'),
  cancelButton: $('#cancel-button'),
  toast: $('#toast'),
  toastMessage: $('#toast-message'),
  toastUndo: $('#toast-undo'),
};

/* ===================================================================
 *  日付のお手伝い関数
 *  日付は '2026-11-20' のような文字列で扱います（比較が簡単なため）
 * =================================================================== */
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function todayString() {
  return toDateString(new Date());
}

/** 今週の終わり（日曜日）。週は月曜はじまりとして考えます */
function endOfWeekString() {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7;
  return toDateString(addDays(now, daysUntilSunday));
}

/** 今週末（土曜日）。今日が日曜なら今日 */
function weekendString() {
  const now = new Date();
  if (now.getDay() === 0) return toDateString(now);
  return toDateString(addDays(now, 6 - now.getDay()));
}

/** 今日から何日後か（過ぎていればマイナス） */
function daysFromToday(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/** 期限の表示用の文字と色の種類を決める */
function dueInfo(due) {
  if (!due) return null;
  const diff = daysFromToday(due);
  const [, m, d] = due.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(due + 'T00:00:00').getDay()];
  const dateText = `${m}/${d}(${weekday})`;

  if (diff < 0) return { text: `期限切れ ${dateText}`, level: 'overdue' };
  if (diff === 0) return { text: '今日まで', level: 'today' };
  if (diff === 1) return { text: '明日まで', level: 'soon' };
  if (diff <= 3) return { text: `${dateText}まで`, level: 'soon' };
  return { text: `${dateText}まで`, level: 'normal' };
}

/* ===================================================================
 *  タスクの絞り込みと並べ替え
 * =================================================================== */
function visibleTasks() {
  const today = todayString();
  const weekEnd = endOfWeekString();

  const inCategory = state.tasks.filter((t) => t.category === state.category);

  let result;
  switch (state.filter) {
    case 'today': // 今日まで（期限切れも含む）
      result = inCategory.filter((t) => !t.done && t.due && t.due <= today);
      break;
    case 'week':  // 今週の日曜日まで（期限切れも含む）
      result = inCategory.filter((t) => !t.done && t.due && t.due <= weekEnd);
      break;
    case 'nodue':
      result = inCategory.filter((t) => !t.done && !t.due);
      break;
    case 'done': // 完了済みは、新しく完了したものが上
      return inCategory
        .filter((t) => t.done)
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    default:      // すべて（未完了のもの）
      result = inCategory.filter((t) => !t.done);
  }

  // 並べ替え：①期限が近い順（期限なしは最後） ②優先順位が高い順 ③登録が古い順
  return result.sort((a, b) => {
    if (a.due !== b.due) {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.localeCompare(b.due);
    }
    if (a.priority !== b.priority) {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/* ===================================================================
 *  画面を描く
 * =================================================================== */
function render() {
  // タブと絞り込みボタンの見た目を更新
  els.tabs.forEach((tab) => {
    const active = tab.dataset.category === state.category;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active);
  });
  els.filters.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.filter === state.filter);
  });
  document.body.dataset.category = state.category;

  // 未完了の件数などのまとめ
  const open = state.tasks.filter((t) => t.category === state.category && !t.done);
  const overdue = open.filter((t) => t.due && t.due < todayString()).length;
  els.summary.textContent =
    `未完了 ${open.length}件` + (overdue ? `（うち期限切れ ${overdue}件）` : '');

  // 一覧を作り直す
  const tasks = visibleTasks();
  els.list.innerHTML = '';
  tasks.forEach((task) => els.list.appendChild(createTaskItem(task)));

  // 1件もないときのメッセージ
  els.empty.hidden = tasks.length > 0;
  if (tasks.length === 0) {
    els.empty.textContent = state.filter === 'done'
      ? '完了したタスクはまだありません'
      : 'タスクはありません 🎉\n上の入力欄から追加できます';
  }
}

/** タスク1件分の表示部品を作る */
function createTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task priority-${task.priority}` + (task.done ? ' is-done' : '');

  // 完了チェック
  const check = document.createElement('button');
  check.className = 'task-check';
  check.setAttribute('aria-label', task.done ? '未完了に戻す' : '完了にする');
  check.textContent = task.done ? '✓' : '';
  check.addEventListener('click', (event) => {
    event.stopPropagation(); // 編集画面が開かないようにする
    toggleDone(task.id);
  });

  // タスク名とバッジ
  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title; // textContent を使うと安全に文字を表示できます

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const info = dueInfo(task.due);
  if (info && !task.done) {
    meta.appendChild(createBadge(info.text, `due-${info.level}`));
  }
  if (task.priority !== 'medium') {
    meta.appendChild(createBadge(`優先度 ${PRIORITY_LABELS[task.priority]}`, `prio-${task.priority}`));
  }
  if (task.memo) {
    meta.appendChild(createBadge('📝 メモ', 'memo'));
  }

  body.append(title, meta);
  li.append(check, body);

  // タップで編集画面を開く
  li.addEventListener('click', () => openEditor(task.id));
  return li;
}

function createBadge(text, type) {
  const span = document.createElement('span');
  span.className = `badge badge-${type}`;
  span.textContent = text;
  return span;
}

/* ===================================================================
 *  タスクの操作（追加・完了・編集・削除）
 * =================================================================== */
function createId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function addTask(title) {
  const now = new Date().toISOString();
  const task = {
    id: createId(),
    title,
    category: state.category, // 今開いているタブに登録
    due: null,
    priority: 'medium',
    done: false,
    memo: '',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await TaskStorage.add(task);
  state.tasks.push(task);

  // 追加したタスクが見えるように、絞り込みを調整
  if (state.filter !== 'all' && state.filter !== 'nodue') state.filter = 'all';
  render();
}

async function saveTask(updated) {
  updated.updatedAt = new Date().toISOString();
  await TaskStorage.update(updated);
  state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
  render();
}

async function toggleDone(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const before = { ...task };
  const done = !task.done;
  await saveTask({ ...task, done, completedAt: done ? new Date().toISOString() : null });
  showToast(done ? '完了にしました 👏' : '未完了に戻しました', () => saveTask(before));
}

async function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  await TaskStorage.remove(id);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  render();
  showToast('削除しました', async () => {
    await TaskStorage.add(task);
    state.tasks.push(task);
    render();
  });
}

/* ===================================================================
 *  編集画面
 * =================================================================== */
function selectSegment(container, value) {
  container.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.value === value);
  });
  container.dataset.value = value;
}

function openEditor(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  state.editingId = id;
  els.editTitle.value = task.title;
  els.editDue.value = task.due || '';
  els.editMemo.value = task.memo || '';
  selectSegment(els.editCategory, task.category);
  selectSegment(els.editPriority, task.priority);
  els.dialog.showModal();
}

function closeEditor() {
  state.editingId = null;
  els.dialog.close();
}

/* ===================================================================
 *  画面下のお知らせ（「元に戻す」付き）
 * =================================================================== */
let toastTimer = null;
let undoAction = null;

function showToast(message, onUndo) {
  els.toastMessage.textContent = message;
  undoAction = onUndo || null;
  els.toastUndo.hidden = !onUndo;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  els.toast.hidden = true;
  undoAction = null;
}

/* ===================================================================
 *  ボタンなどの操作を受け付ける設定
 * =================================================================== */
function setupEvents() {
  // タブ切り替え
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.category = tab.dataset.category;
      render();
    });
  });

  // 絞り込み切り替え
  els.filters.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      render();
    });
  });

  // タスク追加
  els.addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // ページの再読み込みを防ぐ
    const title = els.addInput.value.trim();
    if (!title) {
      els.addInput.focus();
      return;
    }
    await addTask(title);
    els.addInput.value = '';
    showToast(`「${CATEGORY_LABELS[state.category]}」に追加しました`);
  });

  // 編集画面：カテゴリ・優先順位のボタン
  [els.editCategory, els.editPriority].forEach((container) => {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) selectSegment(container, button.dataset.value);
    });
  });

  // 編集画面：期限のかんたん設定ボタン
  document.querySelectorAll('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const map = {
        today: todayString(),
        tomorrow: toDateString(addDays(new Date(), 1)),
        weekend: weekendString(),
        none: '',
      };
      els.editDue.value = map[button.dataset.quick];
    });
  });

  // 編集画面：保存
  els.editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const task = state.tasks.find((t) => t.id === state.editingId);
    const title = els.editTitle.value.trim();
    if (!task || !title) return;
    await saveTask({
      ...task,
      title,
      category: els.editCategory.dataset.value,
      due: els.editDue.value || null,
      priority: els.editPriority.dataset.value,
      memo: els.editMemo.value.trim(),
    });
    closeEditor();
    showToast('保存しました');
  });

  // 編集画面：削除
  els.deleteButton.addEventListener('click', async () => {
    const id = state.editingId;
    if (!confirm('このタスクを削除しますか？')) return;
    closeEditor();
    await deleteTask(id);
  });

  // 編集画面：キャンセル／外側をタップして閉じる
  els.cancelButton.addEventListener('click', closeEditor);
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) closeEditor();
  });

  // 元に戻す
  els.toastUndo.addEventListener('click', async () => {
    const action = undoAction;
    hideToast();
    if (action) await action();
  });
}

/* ===================================================================
 *  アプリの開始
 * =================================================================== */
async function start() {
  state.tasks = await TaskStorage.getAll();
  setupEvents();
  render();
}

start();
