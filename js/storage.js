/*
 * ===================================================================
 *  storage.js ―― データ保存の担当
 * ===================================================================
 *  アプリ本体（app.js）は、データの保存・読み込みを必ずこのファイルの
 *  「TaskStorage」を通して行います。
 *
 *  今はブラウザの「ローカルストレージ」に保存しています。
 *  将来、家族と共有するためにクラウド（例：Firebase など）へ保存先を
 *  変えるときは、このファイルの中身だけを書き換えれば OK です。
 *
 *  ※ どの関数も async（非同期）にしているのは、クラウド保存に
 *    変えたとき「通信を待つ」形になっても app.js を直さずに済むためです。
 * ===================================================================
 */

const TaskStorage = (() => {
  // ローカルストレージの中で使う名前（棚のラベルのようなもの）
  const STORAGE_KEY = 'myTaskAssistant.tasks.v1';

  /** 保存されているタスクを全部読み込む（内部用） */
  function readAll() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      return text ? JSON.parse(text) : [];
    } catch (error) {
      console.error('タスクの読み込みに失敗しました', error);
      return [];
    }
  }

  /** タスクを全部書き込む（内部用） */
  function writeAll(tasks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      // プライベートブラウズ中や容量オーバーのときに起こることがあります
      console.error('タスクの保存に失敗しました', error);
      alert('保存に失敗しました。Safari のプライベートブラウズを使っている場合は、通常モードでお試しください。');
    }
  }

  return {
    /** すべてのタスクを取得 */
    async getAll() {
      return readAll();
    },

    /** タスクを1件追加 */
    async add(task) {
      const tasks = readAll();
      tasks.push(task);
      writeAll(tasks);
      return task;
    },

    /** タスクを1件更新（id が同じものを置き換える） */
    async update(task) {
      const tasks = readAll().map((t) => (t.id === task.id ? task : t));
      writeAll(tasks);
      return task;
    },

    /** タスクを1件削除 */
    async remove(id) {
      writeAll(readAll().filter((t) => t.id !== id));
    },
  };
})();
