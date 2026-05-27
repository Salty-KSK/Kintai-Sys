const fs = require('fs');

const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxIx_6IXSGr-_K2dHij2pP0I5k8GRZj9GTHBSeT3IYFyZPERk7v_BWRIMezrKjBZh9GDQ/exec";

// 3月26日から4月25日までの31日分を生成する
const simulateMonth = async () => {
  console.log("スプレッドシートへの1ヶ月分のテスト送出を開始します...");
  
  const startDate = new Date(2026, 2, 26); // 2026/03/26 (Month is 0-indexed in JS)
  const endDate = new Date(2026, 3, 25);   // 2026/04/25
  
  const days = [];
  let current = new Date(startDate);
  
  while (current <= endDate) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    
    // ランダムな出勤時間を生成 (8:00 〜 9:30)
    const clockInHour = 8;
    const clockInMin = Math.floor(Math.random() * 30);
    const clockIn = `${clockInHour}:${String(clockInMin).padStart(2, '0')}`;
    
    // ランダムな退勤時間を生成 (17:30 〜 20:30)
    const clockOutHour = 17 + Math.floor(Math.random() * 4);
    const clockOutMin = Math.floor(Math.random() * 60);
    const clockOut = `${clockOutHour}:${String(clockOutMin).padStart(2, '0')}`;
    
    // 計算を簡易シミュレート (正確な計算はシート側でも確認できますが、仮の値を入れます)
    const workMinutes = (clockOutHour * 60 + clockOutMin) - (clockInHour * 60 + clockInMin) - 60; // 1時間休憩引く
    
    const isWeekend = current.getDay() === 0 || current.getDay() === 6;
    
    // 土日はお休みの体裁、だけどたまに少し働く
    // 50%の確率で休出する
    const workOnWeekend = isWeekend && Math.random() > 0.5;
    
    if (isWeekend && !workOnWeekend) {
      days.push({
        date: `${yyyy}/${mm}/${dd}`,
        name: "塩野谷 圭介",
        clockIn: "",
        clockOut: "",
        breakMinutes: "",
        workingMinutes: "",
        regularMinutes: "",
        overtimeMinutes: "",
        nightMinutes: "",
        status: "未出勤"
      });
    } else {
      // 休日出勤の場合は少し短め (10:00 〜 15:00 など) にする
      let finalClockIn = clockIn;
      let finalClockOut = clockOut;
      let finalWorkMin = workMinutes;
      let finalReg = "8:00";
      let finalOvertime = "0:00";
      
      if (workOnWeekend) {
        finalClockIn = "10:00";
        finalClockOut = "15:00";
        finalWorkMin = 5 * 60; // 5 hours, no lunch
        finalReg = "0:00"; // 休日労働なので所定は0になる仕様かもしれません。とりあえず5:00にしますか?
        // 休日出勤の法定外休日・法定休日の計算はGASに任せるとして、ここでは一旦workingMinutesに入れとく
      }
      
      days.push({
        date: `${yyyy}/${mm}/${dd}`,
        name: "塩野谷 圭介",
        clockIn: finalClockIn,
        clockOut: finalClockOut,
        breakMinutes: workOnWeekend ? "0:00" : "1:00",
        workingMinutes: workOnWeekend ? "5:00" : `${Math.floor(finalWorkMin / 60)}:${String(finalWorkMin % 60).padStart(2, '0')}`,
        regularMinutes: workOnWeekend ? "0:00" : "8:00",
        overtimeMinutes: workOnWeekend ? "5:00" : (finalWorkMin > 480 ? `${Math.floor((finalWorkMin - 480) / 60)}:${String((finalWorkMin - 480) % 60).padStart(2, '0')}` : "0:00"),
        nightMinutes: (!workOnWeekend && clockOutHour >= 22) ? `${clockOutHour - 22}:${String(clockOutMin).padStart(2, '0')}` : "0:00",
        status: "退勤済"
      });
    }
    
    current.setDate(current.getDate() + 1);
  }

  // APIへ順番に送信
  for (let i = 0; i < days.length; i++) {
    const payload = days[i];
    console.log(`送信中 [${i + 1}/${days.length}] : ${payload.date} ...`);
    
    try {
      const response = await fetch(GAS_WEBHOOK_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      });
      await response.text(); // 完了を待つ
    } catch (e) {
      console.error(`エラーが発生しました ${payload.date}:`, e);
    }
    
    // GASの負荷を考慮して1秒待機
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log("テストデータの送信がすべて完了しました！スプレッドシートをご確認ください。");
}

simulateMonth();
