const fs = require('fs')
const os = require('os')
const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
})
const sep = require('path').sep
const {SETTINGS_FILE_NAME, BATCH_SIZE_KEY, DIR_KEY, DNL_SITE_KEY, FIXES_ENABLE_KEY, go, parseSettings} = require('./util')

const settingsToUse = {}, stats = {success: 0, failed: 0, total: 0}

settingsToUse[DNL_SITE_KEY] = {v: 'https://nordvpn.com/ovpn/', message: 'Download site:', f: v => v}
settingsToUse[BATCH_SIZE_KEY] = {
    v: 200, message: 'Batch size:', f: v => {
        const number = Number.parseInt(v, 10)
        if (number > 0) {
            return number
        }
        throw Error
    }
}
settingsToUse[DIR_KEY] = {
    v: os.homedir() + (os.platform() === 'win32' ? '\\Desktop\\' : sep) + 'ovpns' + sep,
    message: 'Download to folder:',
    f: v => v + (v.endsWith(sep) ? '' : sep),
}
settingsToUse[FIXES_ENABLE_KEY] = {v: false, message: 'Apply fixes?', f: v => JSON.parse(v.toLowerCase())}

function question(settingEntry) {
    if (settingEntry.done) {
        rl.close()
        go(settingsToUse, stats)
        return
    }
    rl.question(`${settingEntry.value[1].message} [\x1b[36m${settingEntry.value[1].v}\x1b[0m] `, answer => {
        if (answer) {
            try {
                settingsToUse[settingEntry.value[0]].v = settingsToUse[settingEntry.value[0]].f(answer)
            } catch {
                question(settingEntry)
                return
            }
        }
        question(it.next())
    })
}

if (fs.existsSync(SETTINGS_FILE_NAME)) {
    Object.entries(parseSettings(fs.readFileSync(SETTINGS_FILE_NAME, {encoding: 'utf8'}))).forEach(it => {
        try {
            settingsToUse[it[0]].v = settingsToUse[it[0]].f(it[1])
        } catch {
        }
    })
}
const it = Object.entries(settingsToUse)[Symbol.iterator]()
question(it.next())