// utils/audio.js
const audio = wx.createInnerAudioContext();
audio.src = '/assets/drop.mp3'; // 替换为你的路径
audio.obeyMuteSwitch = false; // 静音开关无效（保证播放）
audio.volume = 1.0;

export function playDropSound() {
  audio.stop();  // 避免连续触发时重叠播放
  audio.play();
}
