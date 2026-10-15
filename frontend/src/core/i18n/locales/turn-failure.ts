/**
 * Copy for a turn that could not run because no model is connected
 * (core/threads/errors.ts `isNoModelConfigured`). That is a setup step, not a
 * task failure, so the receipt explains it and offers 添加模型 instead of 重试.
 */

export interface TurnFailureCopy {
  noModel: string;
  /** The failure card's heading for ``noModel``. */
  noModelTitle: string;
  addModel: string;
}

const zhCN: TurnFailureCopy = {
  noModel: "还没有可用的模型。添加一个模型后，重新发送即可。",
  noModelTitle: "先连接一个模型",
  addModel: "添加模型",
};

const enUS: TurnFailureCopy = {
  noModel: "No model is available yet. Add a model, then send again.",
  noModelTitle: "Connect a model first",
  addModel: "Add a model",
};

const jaJP: TurnFailureCopy = {
  noModel:
    "利用できるモデルがまだありません。モデルを追加してから、もう一度送信してください。",
  noModelTitle: "まずモデルを接続してください",
  addModel: "モデルを追加",
};

const koKR: TurnFailureCopy = {
  noModel:
    "아직 사용할 수 있는 모델이 없습니다. 모델을 추가한 뒤 다시 보내세요.",
  noModelTitle: "먼저 모델을 연결하세요",
  addModel: "모델 추가",
};

export function turnFailureCopy(locale: string): TurnFailureCopy {
  if (locale.startsWith("zh")) return zhCN;
  if (locale.startsWith("ja")) return jaJP;
  if (locale.startsWith("ko")) return koKR;
  return enUS;
}
