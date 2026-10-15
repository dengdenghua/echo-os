/**
 * Copy for the owner view of 可观测性 › 总览: is my agent healthy, what ran,
 * what failed and what to do. Plain language, no engine or competitor names;
 * the developer dashboard keeps its own copy (agent-operator.ts).
 */

export interface ObservabilityOwnerCopy {
  pageSubtitle: string;
  overviewTab: string;
  checking: string;
  healthyTitle: string;
  healthyHint: string;
  idleHint: string;
  needsModelTitle: string;
  needsModelHint: string;
  attentionTitle: (count: number) => string;
  attentionHint: string;
  offlineTitle: string;
  offlineHint: string;
  refresh: string;
  updatedAt: (time: string) => string;
  tileRanToday: string;
  tileCompleted: string;
  tileFailed: string;
  tileWaiting: string;
  todoTitle: string;
  todoNone: string;
  todoAddModelTitle: string;
  todoAddModelHint: string;
  todoAddModelAction: string;
  todoFailedTitle: (title: string) => string;
  todoFailedHint: string;
  todoOpenThread: string;
  todoWaitingTitle: (count: number) => string;
  todoWaitingHint: string;
  todoRestartTitle: string;
  todoRestartHint: string;
  recentTitle: string;
  recentEmpty: string;
  untitledRun: string;
  runStatus: {
    completed: string;
    running: string;
    failed: string;
    notStarted: string;
    paused: string;
    interrupted: string;
    cancelled: string;
    unknown: string;
  };
  developerDetails: string;
  developerDetailsHint: string;
}

const zhCN: ObservabilityOwnerCopy = {
  pageSubtitle: "Echo 是否正常、最近做了什么、哪里需要你处理。",
  overviewTab: "总览",
  checking: "正在检查 Echo 的状态…",
  healthyTitle: "Echo 运行正常",
  healthyHint: "后台在线，最近的任务都已完成。",
  idleHint: "后台在线。交给 Echo 一件事后，这里会显示它做了什么。",
  needsModelTitle: "还没有连接模型",
  needsModelHint: "后台在线，但 Echo 需要一个模型才能回复和执行任务。",
  attentionTitle: (count) => `有 ${count} 件事需要你处理`,
  attentionHint: "后台在线。下面列出了需要你看一眼的事。",
  offlineTitle: "暂时连不上 Echo 后台",
  offlineHint: "读不到后台状态，页面会自动重试。若持续如此，请重启 ECHO OS。",
  refresh: "刷新",
  updatedAt: (time) => `更新于 ${time}`,
  tileRanToday: "今天运行",
  tileCompleted: "已完成",
  tileFailed: "未完成",
  tileWaiting: "等你处理",
  todoTitle: "需要你处理",
  todoNone: "没有需要你处理的事。",
  todoAddModelTitle: "连接一个模型",
  todoAddModelHint: "添加模型后，Echo 才能回复对话、执行任务。",
  todoAddModelAction: "添加模型",
  todoFailedTitle: (title) => `「${title}」没有完成`,
  todoFailedHint: "打开对话查看原因，需要的话重新发送。",
  todoOpenThread: "打开对话",
  todoWaitingTitle: (count) => `${count} 个任务在等你继续`,
  todoWaitingHint: "它们在等你确认或恢复，处理后会接着执行。",
  todoRestartTitle: "后台有更新，重启后生效",
  todoRestartHint: "重启 ECHO OS 后，新版本才会运行。",
  recentTitle: "最近运行",
  recentEmpty: "还没有运行记录。",
  untitledRun: "未命名任务",
  runStatus: {
    completed: "已完成",
    running: "进行中",
    failed: "未完成",
    notStarted: "未开始",
    paused: "已暂停",
    interrupted: "已中断",
    cancelled: "已取消",
    unknown: "状态未知",
  },
  developerDetails: "开发者详情",
  developerDetailsHint:
    "进化队列、评分卡、回放门禁和策略草案，供开发和排查使用。",
};

const enUS: ObservabilityOwnerCopy = {
  pageSubtitle:
    "Whether Echo is healthy, what it did lately, and what needs you.",
  overviewTab: "Overview",
  checking: "Checking Echo…",
  healthyTitle: "Echo is healthy",
  healthyHint: "The backend is online and recent tasks finished.",
  idleHint:
    "The backend is online. Hand Echo a task and what it did shows up here.",
  needsModelTitle: "No model connected yet",
  needsModelHint:
    "The backend is online, but Echo needs a model to reply and run tasks.",
  attentionTitle: (count) =>
    count === 1 ? "1 thing needs you" : `${count} things need you`,
  attentionHint: "The backend is online. The list below needs a look.",
  offlineTitle: "Can't reach the Echo backend",
  offlineHint:
    "The status could not be read; this page retries on its own. If it keeps failing, restart ECHO OS.",
  refresh: "Refresh",
  updatedAt: (time) => `Updated ${time}`,
  tileRanToday: "Ran today",
  tileCompleted: "Completed",
  tileFailed: "Not finished",
  tileWaiting: "Waiting on you",
  todoTitle: "Needs you",
  todoNone: "Nothing needs you right now.",
  todoAddModelTitle: "Connect a model",
  todoAddModelHint: "Once a model is added, Echo can reply and run tasks.",
  todoAddModelAction: "Add a model",
  todoFailedTitle: (title) => `"${title}" did not finish`,
  todoFailedHint:
    "Open the conversation to see why, then send it again if needed.",
  todoOpenThread: "Open conversation",
  todoWaitingTitle: (count) =>
    count === 1
      ? "1 task is waiting on you"
      : `${count} tasks are waiting on you`,
  todoWaitingHint: "They resume once you confirm or continue them.",
  todoRestartTitle: "An update is waiting for a restart",
  todoRestartHint: "Restart ECHO OS to run the new version.",
  recentTitle: "Recent runs",
  recentEmpty: "No runs yet.",
  untitledRun: "Untitled task",
  runStatus: {
    completed: "Completed",
    running: "Running",
    failed: "Not finished",
    notStarted: "Not started",
    paused: "Paused",
    interrupted: "Interrupted",
    cancelled: "Cancelled",
    unknown: "Unknown",
  },
  developerDetails: "Developer details",
  developerDetailsHint:
    "Evolution queue, scorecards, replay gate and policy drafts, for development and troubleshooting.",
};

const jaJP: ObservabilityOwnerCopy = {
  ...enUS,
  pageSubtitle:
    "Echo が正常か、最近なにをしたか、対応が必要なことを確認します。",
  overviewTab: "概要",
  checking: "Echo の状態を確認しています…",
  healthyTitle: "Echo は正常に動作しています",
  healthyHint: "バックエンドはオンラインで、最近のタスクは完了しています。",
  idleHint:
    "バックエンドはオンラインです。Echo にタスクを任せると、ここに内容が表示されます。",
  needsModelTitle: "モデルがまだ接続されていません",
  needsModelHint:
    "バックエンドはオンラインですが、返信やタスク実行にはモデルが必要です。",
  attentionTitle: (count) => `対応が必要なことが ${count} 件あります`,
  attentionHint: "バックエンドはオンラインです。下の項目を確認してください。",
  offlineTitle: "Echo バックエンドに接続できません",
  offlineHint:
    "状態を取得できませんでした。自動で再試行します。続く場合は ECHO OS を再起動してください。",
  refresh: "更新",
  updatedAt: (time) => `${time} に更新`,
  tileRanToday: "今日の実行",
  tileCompleted: "完了",
  tileFailed: "未完了",
  tileWaiting: "対応待ち",
  todoTitle: "対応が必要",
  todoNone: "対応が必要なことはありません。",
  todoAddModelTitle: "モデルを接続する",
  todoAddModelHint:
    "モデルを追加すると、Echo が返信やタスク実行をできるようになります。",
  todoAddModelAction: "モデルを追加",
  todoFailedTitle: (title) => `「${title}」は完了しませんでした`,
  todoFailedHint: "会話を開いて原因を確認し、必要なら再送信してください。",
  todoOpenThread: "会話を開く",
  todoWaitingTitle: (count) => `${count} 件のタスクが対応を待っています`,
  todoWaitingHint: "確認または再開すると続行します。",
  todoRestartTitle: "更新は再起動後に反映されます",
  todoRestartHint: "ECHO OS を再起動すると新しいバージョンが動作します。",
  recentTitle: "最近の実行",
  recentEmpty: "実行記録はまだありません。",
  untitledRun: "無題のタスク",
  runStatus: {
    completed: "完了",
    running: "実行中",
    failed: "未完了",
    notStarted: "未開始",
    paused: "一時停止",
    interrupted: "中断",
    cancelled: "キャンセル",
    unknown: "不明",
  },
  developerDetails: "開発者向け詳細",
  developerDetailsHint:
    "進化キュー、スコアカード、リプレイゲート、ポリシー草案（開発・調査用）。",
};

const koKR: ObservabilityOwnerCopy = {
  ...enUS,
  pageSubtitle:
    "Echo가 정상인지, 최근 무엇을 했는지, 무엇을 처리해야 하는지 봅니다.",
  overviewTab: "개요",
  checking: "Echo 상태를 확인하는 중…",
  healthyTitle: "Echo가 정상 작동 중입니다",
  healthyHint: "백엔드가 온라인이며 최근 작업이 완료되었습니다.",
  idleHint: "백엔드가 온라인입니다. Echo에게 작업을 맡기면 여기에 표시됩니다.",
  needsModelTitle: "아직 연결된 모델이 없습니다",
  needsModelHint:
    "백엔드는 온라인이지만, 답변과 작업 실행에는 모델이 필요합니다.",
  attentionTitle: (count) => `처리할 일이 ${count}건 있습니다`,
  attentionHint: "백엔드가 온라인입니다. 아래 항목을 확인하세요.",
  offlineTitle: "Echo 백엔드에 연결할 수 없습니다",
  offlineHint:
    "상태를 읽지 못했습니다. 자동으로 다시 시도합니다. 계속되면 ECHO OS를 다시 시작하세요.",
  refresh: "새로고침",
  updatedAt: (time) => `${time} 업데이트`,
  tileRanToday: "오늘 실행",
  tileCompleted: "완료",
  tileFailed: "미완료",
  tileWaiting: "대기 중",
  todoTitle: "처리할 일",
  todoNone: "지금 처리할 일이 없습니다.",
  todoAddModelTitle: "모델 연결",
  todoAddModelHint:
    "모델을 추가하면 Echo가 답변하고 작업을 실행할 수 있습니다.",
  todoAddModelAction: "모델 추가",
  todoFailedTitle: (title) => `"${title}" 작업이 완료되지 않았습니다`,
  todoFailedHint: "대화를 열어 원인을 확인하고, 필요하면 다시 보내세요.",
  todoOpenThread: "대화 열기",
  todoWaitingTitle: (count) => `작업 ${count}건이 대기 중입니다`,
  todoWaitingHint: "확인하거나 재개하면 계속 실행됩니다.",
  todoRestartTitle: "업데이트는 다시 시작 후 적용됩니다",
  todoRestartHint: "ECHO OS를 다시 시작하면 새 버전이 실행됩니다.",
  recentTitle: "최근 실행",
  recentEmpty: "아직 실행 기록이 없습니다.",
  untitledRun: "제목 없는 작업",
  runStatus: {
    completed: "완료",
    running: "실행 중",
    failed: "미완료",
    notStarted: "시작 안 됨",
    paused: "일시 중지",
    interrupted: "중단됨",
    cancelled: "취소됨",
    unknown: "알 수 없음",
  },
  developerDetails: "개발자 정보",
  developerDetailsHint:
    "진화 대기열, 스코어카드, 리플레이 게이트, 정책 초안(개발·문제 해결용).",
};

export function observabilityOwnerCopy(locale: string): ObservabilityOwnerCopy {
  if (locale.startsWith("zh")) return zhCN;
  if (locale.startsWith("ja")) return jaJP;
  if (locale.startsWith("ko")) return koKR;
  return enUS;
}
