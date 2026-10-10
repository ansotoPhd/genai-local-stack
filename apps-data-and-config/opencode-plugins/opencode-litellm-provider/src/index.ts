// Exportación única del plugin: opencode carga este módulo y llama a setup().
import { PLUGIN_ID } from './log'
import { setup } from './plugin'

export default { id: PLUGIN_ID, setup }
