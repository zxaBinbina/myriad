// 在样式加载前确定配色与明暗，避免首帧闪烁（MV3 不允许内联脚本，所以单独成文件）
;(function () {
  var boot = {}
  try {
    boot = JSON.parse(localStorage.getItem('myriad-boot') || '{}') || {}
  } catch (e) {}
  var mode = boot.theme === 'light' || boot.theme === 'dark' ? boot.theme : 'auto'
  var theme =
    mode !== 'auto' ? mode : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  var palette = boot.palette === 'hutao-red' ? 'hutao-red' : 'fufu-blue'
  var bg = {
    'fufu-blue:dark': '#141521',
    'fufu-blue:light': '#f4f6fa',
    'hutao-red:dark': '#3a1b19',
    'hutao-red:light': '#fcf0e1',
  }
  var root = document.documentElement
  root.dataset.myriadPalette = palette
  root.dataset.myriadTheme = theme
  root.style.colorScheme = theme
  root.style.background = bg[palette + ':' + theme]
  window.__MYRIAD_BOOT__ = boot
})()
