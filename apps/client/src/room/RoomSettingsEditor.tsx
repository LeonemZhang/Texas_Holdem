import { useState, type FormEvent } from 'react';

import {
  RoomSettingsSchema,
  type RoomSettingsMessage,
} from '@texas-holdem/protocol';

const blindOptions = [1, 5, 10, 25, 50, 100] as const;
type BlindGrowthSelection = 'none' | 'multiplier' | 'increment';

function clampToMinimum(value: number, minimum: number): number {
  return Number.isFinite(value)
    ? Math.max(minimum, Math.trunc(value))
    : minimum;
}

function normalizeMinimumInput(value: string, minimum: number): string {
  return String(clampToMinimum(Number(value), minimum));
}

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
  const [blindGrowthMode, setBlindGrowthMode] = useState<BlindGrowthSelection>(
    settings.blindGrowth.enabled
      ? (settings.blindGrowth.mode ?? 'multiplier')
      : 'none',
  );
  const [blindGrowthIncrement, setBlindGrowthIncrement] = useState(() =>
    String(
      clampToMinimum(
        settings.blindGrowth.increment ?? settings.smallBlind,
        settings.smallBlind,
      ),
    ),
  );
  const [maxSmallBlind, setMaxSmallBlind] = useState(() =>
    settings.blindGrowth.maxSmallBlind === undefined ||
    settings.blindGrowth.maxSmallBlind === null
      ? ''
      : String(
          clampToMinimum(
            settings.blindGrowth.maxSmallBlind,
            settings.smallBlind,
          ),
        ),
  );
  const [error, setError] = useState<string | null>(null);
  const isPreset = blindMode === 'preset';
  const updateSmallBlind = (nextSmallBlind: number) => {
    const normalizedSmallBlind = clampToMinimum(nextSmallBlind, 1);
    setSmallBlind(normalizedSmallBlind);
    setBlindGrowthIncrement((current) =>
      current.trim() === ''
        ? String(normalizedSmallBlind)
        : normalizeMinimumInput(current, normalizedSmallBlind),
    );
    setMaxSmallBlind((current) =>
      current.trim() === ''
        ? ''
        : normalizeMinimumInput(current, normalizedSmallBlind),
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selection = blindGrowthMode;
    const mode = selection === 'increment' ? 'increment' : 'multiplier';
    const normalizedIncrement = clampToMinimum(
      Number(blindGrowthIncrement),
      smallBlind,
    );
    const normalizedMaxSmallBlind =
      maxSmallBlind.trim() === ''
        ? null
        : clampToMinimum(Number(maxSmallBlind), smallBlind);
    const parsed = RoomSettingsSchema.safeParse({
      roomName: String(form.get('roomName') ?? ''),
      maxPlayers: Number(form.get('maxPlayers')),
      initialChips: Number(form.get('initialChips')),
      smallBlind,
      actionTimeoutSeconds: Number(form.get('actionTimeoutSeconds')),
      handReadyTimeoutSeconds: Number(form.get('handReadyTimeoutSeconds')),
      blindGrowth: {
        enabled: selection !== 'none',
        intervalHands: Number(form.get('blindGrowthIntervalHands')),
        mode,
        ...(mode === 'increment'
          ? { increment: normalizedIncrement }
          : { multiplier: Number(form.get('blindGrowthMultiplier')) }),
        maxSmallBlind: normalizedMaxSmallBlind,
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
              updateSmallBlind(Number(event.target.value));
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
              onChange={(event) => updateSmallBlind(Number(event.target.value))}
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
            每局准备秒数
            <input
              name="handReadyTimeoutSeconds"
              type="number"
              min="1"
              step="1"
              defaultValue={settings.handReadyTimeoutSeconds}
            />
          </label>
          <fieldset className="room-form__growth">
            <legend>按局数增长盲注</legend>
            <input
              type="hidden"
              name="blindGrowthMode"
              value={blindGrowthMode}
            />
            <div
              className="room-form__growth-tabs"
              role="tablist"
              aria-label="盲注增长模式"
            >
              <button
                type="button"
                role="tab"
                aria-selected={blindGrowthMode === 'none'}
                className="room-form__growth-tab"
                onClick={() => setBlindGrowthMode('none')}
              >
                不增长
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={blindGrowthMode === 'multiplier'}
                className="room-form__growth-tab"
                onClick={() => setBlindGrowthMode('multiplier')}
              >
                倍率增长
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={blindGrowthMode === 'increment'}
                className="room-form__growth-tab"
                onClick={() => setBlindGrowthMode('increment')}
              >
                步长增长
              </button>
            </div>
            <div className="room-form__growth-values">
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
              {blindGrowthMode === 'increment' ? (
                <label>
                  增长步长（小盲）
                  <input
                    name="blindGrowthIncrement"
                    type="number"
                    min={smallBlind}
                    step="1"
                    value={blindGrowthIncrement}
                    onChange={(event) =>
                      setBlindGrowthIncrement(event.target.value)
                    }
                    onBlur={() =>
                      setBlindGrowthIncrement((current) =>
                        normalizeMinimumInput(current, smallBlind),
                      )
                    }
                  />
                </label>
              ) : (
                <label>
                  增长倍率
                  <select
                    name="blindGrowthMultiplier"
                    defaultValue={String(settings.blindGrowth.multiplier ?? 2)}
                  >
                    <option value="1.5">× 1.5</option>
                    <option value="2">× 2</option>
                    <option value="3">× 3</option>
                  </select>
                </label>
              )}
              <label>
                小盲上限（可选）
                <input
                  name="blindGrowthMaxSmallBlind"
                  type="number"
                  min={smallBlind}
                  step="1"
                  value={maxSmallBlind ?? ''}
                  placeholder="不设上限"
                  onChange={(event) => setMaxSmallBlind(event.target.value)}
                  onBlur={() =>
                    setMaxSmallBlind((current) =>
                      current.trim() === ''
                        ? ''
                        : normalizeMinimumInput(current, smallBlind),
                    )
                  }
                />
              </label>
              <label>
                大盲上限
                <input
                  aria-label="大盲上限"
                  value={
                    maxSmallBlind.trim() === ''
                      ? '不设上限'
                      : clampToMinimum(Number(maxSmallBlind), smallBlind) * 2
                  }
                  readOnly
                />
              </label>
            </div>
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
