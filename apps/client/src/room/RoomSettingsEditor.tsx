import { useState, type FormEvent } from 'react';

import {
  RoomSettingsSchema,
  type RoomSettingsMessage,
} from '@texas-holdem/protocol';

const blindOptions = [1, 5, 10, 25, 50, 100] as const;

export interface RoomSettingsEditorProps {
  readonly settings: RoomSettingsMessage;
  readonly onSubmit: (settings: RoomSettingsMessage) => void;
  readonly formId?: string;
  readonly showSubmitButton?: boolean;
}

export function RoomSettingsEditor({
  settings,
  onSubmit,
  formId,
  showSubmitButton = true,
}: RoomSettingsEditorProps) {
  const [smallBlind, setSmallBlind] = useState(settings.smallBlind);
  const [blindMode, setBlindMode] = useState<'preset' | 'custom'>(
    blindOptions.includes(settings.smallBlind as (typeof blindOptions)[number])
      ? 'preset'
      : 'custom',
  );
  const [error, setError] = useState<string | null>(null);
  const isPreset = blindMode === 'preset';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = RoomSettingsSchema.safeParse({
      roomName: String(form.get('roomName') ?? ''),
      maxPlayers: Number(form.get('maxPlayers')),
      initialChips: Number(form.get('initialChips')),
      smallBlind,
      actionTimeoutSeconds: Number(form.get('actionTimeoutSeconds')),
      handReadyTimeoutSeconds: Number(form.get('handReadyTimeoutSeconds')),
      blindGrowth: {
        enabled: form.get('blindGrowthEnabled') === 'on',
        intervalHands: Number(form.get('blindGrowthIntervalHands')),
        multiplier: Number(form.get('blindGrowthMultiplier')),
      },
      zeroChipPolicy: form.get('zeroChipPolicy'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '房间设置无效');
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  };

  return (
    <form
      id={formId}
      className="room-form room-settings-editor"
      onSubmit={submit}
      noValidate
    >
      <div className="room-form__grid">
        <label>
          房间名称
          <input name="roomName" defaultValue={settings.roomName} />
        </label>
        <label>
          最大人数
          <select name="maxPlayers" defaultValue={String(settings.maxPlayers)}>
            {Array.from({ length: 9 }, (_, index) => index + 2).map((count) => (
              <option key={count} value={count}>
                {count} 人
              </option>
            ))}
          </select>
        </label>
        <label>
          初始筹码
          <input
            name="initialChips"
            type="number"
            min="1"
            step="1"
            defaultValue={settings.initialChips}
          />
        </label>
        <label>
          小盲
          <select
            value={isPreset ? String(smallBlind) : 'custom'}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                setBlindMode('custom');
                return;
              }
              setBlindMode('preset');
              setSmallBlind(Number(event.target.value));
            }}
          >
            {blindOptions.map((blind) => (
              <option key={blind} value={blind}>
                {blind}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
          {!isPreset ? (
            <input
              aria-label="自定义小盲"
              type="number"
              min="1"
              step="1"
              value={smallBlind}
              onChange={(event) => setSmallBlind(Number(event.target.value))}
            />
          ) : null}
        </label>
        <label>
          大盲（小盲 × 2）
          <input
            aria-label="大盲（小盲 × 2）"
            value={smallBlind * 2}
            readOnly
          />
        </label>
      </div>
      <details className="room-form__advanced" open>
        <summary>高级规则：行动时间、盲注增长与零筹码规则</summary>
        <div className="room-form__grid">
          <label>
            单次行动秒数
            <input
              name="actionTimeoutSeconds"
              type="number"
              min="1"
              step="1"
              defaultValue={settings.actionTimeoutSeconds}
            />
          </label>
          <label>
            每手准备秒数
            <input
              name="handReadyTimeoutSeconds"
              type="number"
              min="1"
              step="1"
              defaultValue={settings.handReadyTimeoutSeconds}
            />
          </label>
          <fieldset className="room-form__growth">
            <legend>按手数增长盲注</legend>
            <label className="room-form__checkbox">
              <input
                name="blindGrowthEnabled"
                type="checkbox"
                defaultChecked={settings.blindGrowth.enabled}
              />
              启用增长
            </label>
            <label>
              每多少手
              <input
                name="blindGrowthIntervalHands"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.blindGrowth.intervalHands}
              />
            </label>
            <label>
              增长倍率
              <select
                name="blindGrowthMultiplier"
                defaultValue={String(settings.blindGrowth.multiplier)}
              >
                <option value="1.5">× 1.5</option>
                <option value="2">× 2</option>
                <option value="3">× 3</option>
              </select>
            </label>
          </fieldset>
          <label>
            筹码耗尽时
            <select
              name="zeroChipPolicy"
              defaultValue={settings.zeroChipPolicy}
            >
              <option value="request-chips">请求其他玩家给予筹码</option>
              <option value="eliminate">直接出局</option>
            </select>
          </label>
        </div>
      </details>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {showSubmitButton ? (
        <button type="submit" className="button button--primary">
          保存房间配置
        </button>
      ) : null}
    </form>
  );
}
