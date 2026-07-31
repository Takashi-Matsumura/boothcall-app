"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

const STORAGE_KEY = "boothcall:chime-enabled";
// 同一タブ内で toggle() した変更を useSyncExternalStore に伝える自前イベント。
// ("storage" イベントは変更を起こしたタブ自身には発火しないため。)
const CHANGE_EVENT = "boothcall:chime-changed";

// 「ピンポンパンポン」相当の4音シーケンス(周波数Hz, 開始秒, 長さ秒)。
const NOTES: { freq: number; start: number; duration: number }[] = [
  { freq: 880, start: 0, duration: 0.32 },
  { freq: 659, start: 0.3, duration: 0.32 },
  { freq: 587, start: 0.6, duration: 0.32 },
  { freq: 440, start: 0.9, duration: 0.42 },
];

function subscribeChimePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getChimeSnapshot(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerChimeSnapshot(): boolean {
  return false;
}

export function useChime() {
  const enabled = useSyncExternalStore(
    subscribeChimePreference,
    getChimeSnapshot,
    getServerChimeSnapshot,
  );
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      contextRef.current = new Ctor();
    }
    return contextRef.current;
  }, []);

  const synthesize = useCallback((ctx: AudioContext) => {
    const now = ctx.currentTime;
    for (const note of NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = note.freq;

      const startAt = now + note.start;
      const endAt = startAt + note.duration;

      // アタック/リリースのエンベロープでクリック音を防ぐ。
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.35, startAt + 0.02);
      gain.gain.linearRampToValueAtTime(0, endAt);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(endAt + 0.02);
    }
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    const ctx = getContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    synthesize(ctx);
  }, [enabled, getContext, synthesize]);

  const toggle = useCallback(() => {
    const next = !getChimeSnapshot();
    window.localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));

    if (next) {
      // ユーザー操作の同期コンテキスト内で resume させ、
      // ブラウザの自動再生制限を解除する。テスト音も1回鳴らして確認できるようにする。
      const ctx = getContext();
      void ctx.resume();
      synthesize(ctx);
    }
  }, [getContext, synthesize]);

  return { enabled, toggle, play };
}
