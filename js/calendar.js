/*
 * ===================================================================
 *  calendar.js ―― iPad/iPhone の「カレンダー」に予定を追加する担当
 * ===================================================================
 *  「.ics」という、どのカレンダーアプリでも読める共通の形式で
 *  予定データを作り、カレンダーアプリに渡します。
 *  予定には「アラーム（通知）」を付けるので、このアプリを閉じていても
 *  iPad 自身が時間になったら知らせてくれます。
 * ===================================================================
 */

const CalendarExport = (() => {
  /** .ics の決まりに合わせて、特別な記号の前に「\」を付ける */
  function escapeText(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** '2026-11-20' と '09:00' → '20261120T090000' */
  function toIcsLocal(date, time) {
    return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  }

  /** 今の日時（世界標準時）→ '20261116T120000Z' */
  function nowUtc() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /** 開始時刻の15分後（予定の終わり）を計算 */
  function plus15Minutes(date, time) {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const end = new Date(y, m - 1, d, hh, mm + 15);
    const pad = (n) => String(n).padStart(2, '0');
    return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}` +
           `T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  }

  /** タスクから .ics の文章を作る */
  function buildIcs({ id, title, memo, due, time }) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//My Task Assistant//JA',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${id}@my-task-assistant`,
      `DTSTAMP:${nowUtc()}`,
      `DTSTART:${toIcsLocal(due, time)}`,
      `DTEND:${plus15Minutes(due, time)}`,
      `SUMMARY:${escapeText(title)}`,
    ];
    if (memo) lines.push(`DESCRIPTION:${escapeText(memo)}`);
    lines.push(
      'BEGIN:VALARM',           // ここからアラームの設定
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      'TRIGGER:PT0M',           // 予定の時刻ちょうどに通知
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    );
    return lines.join('\r\n') + '\r\n';
  }

  /** iPad / iPhone かどうか（最近の iPad は Mac のふりをするので両方調べる） */
  function isAppleMobile() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  return {
    buildIcs,

    /** カレンダーアプリに予定を渡す */
    open(task) {
      const ics = buildIcs(task);
      if (isAppleMobile()) {
        // iPad/iPhone の Safari は、この形で渡すと「カレンダーに追加」画面が開きます
        window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
        return;
      }
      // パソコンなどでは .ics ファイルとしてダウンロードします
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'task.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
})();
