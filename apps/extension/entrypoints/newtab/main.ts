import { MyriadApp } from '@myriad/ui'
import { createApp } from 'vue'
import { createExtensionPlatform } from './platform'
import './page.css'

const platform = createExtensionPlatform()
const boot =
  (window as unknown as { __MYRIAD_BOOT__?: { grabFocus?: boolean } }).__MYRIAD_BOOT__ ?? {}

if (boot.grabFocus && !platform.focusRequested && platform.grabFocus) {
  platform.grabFocus()
} else {
  createApp(MyriadApp, { platform }).mount('#app')
}
