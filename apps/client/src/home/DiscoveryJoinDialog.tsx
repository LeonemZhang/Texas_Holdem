import { useId, useState, type FormEvent } from 'react';

import { ModalDialog } from '../room/ModalDialog.js';

export interface DiscoveryJoinDialogProps {
  readonly roomName: string;
  readonly initialNickname?: string;
  readonly resumeNicknameChange?: boolean;
  readonly joining: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: (nickname: string) => void;
}

export function DiscoveryJoinDialog({
  roomName,
  initialNickname,
  resumeNicknameChange = false,
  joining,
  error,
  onCancel,
  onConfirm,
}: DiscoveryJoinDialogProps) {
  const formId = useId();
  const [nickname, setNickname] = useState(initialNickname ?? 'Bob');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNickname = nickname.trim();
    if (trimmedNickname) onConfirm(trimmedNickname);
  };

  return (
    <ModalDialog
      title={`${resumeNicknameChange ? '恢复' : '加入'}“${roomName}”`}
      confirmAction={{
        label: joining
          ? '正在加入…'
          : resumeNicknameChange
            ? '确认恢复'
            : '确定加入',
        type: 'submit',
        form: formId,
        disabled: joining || !nickname.trim(),
      }}
      onCancel={onCancel}
    >
      <form
        id={formId}
        className="discovery-join-dialog__form"
        onSubmit={submit}
      >
        <p>
          {resumeNicknameChange
            ? '使用原令牌恢复，可在这里修改昵称。'
            : '请输入昵称，确认后即可进入房间。'}
        </p>
        <label htmlFor={`${formId}-nickname`}>玩家昵称</label>
        <input
          id={`${formId}-nickname`}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="nickname"
          disabled={joining}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
