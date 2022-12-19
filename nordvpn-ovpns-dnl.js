const fs = require('fs')
const os = require('os')
const SEP = require('path').sep
const {
    BATCH_SIZE_KEY, DIR_KEY, DNL_SITE_KEY, FIXES_ENABLE_KEY, COUNTRIES_KEY, UNATTENDED_KEY, parseSettings, question,
} = require('./consts-and-funcs')

const SETTINGS_FILE = __dirname + SEP + 'settings.ini', settingsToUse = {}, stats = {success: 0, failed: 0, total: 0}

settingsToUse[DNL_SITE_KEY] = {
    v: 'https://nordvpn.com/ovpn/', message: 'Download site:', f: v => {
        if (!(v = v.trim())) {
            throw Error
        }
        return v
    },
}
settingsToUse[BATCH_SIZE_KEY] = {
    v: 200, message: 'Batch size:', f: v => {
        const number = Number.parseInt(v, 10)
        if (number > 0) {
            return number
        }
        throw Error
    },
}
settingsToUse[DIR_KEY] = {
    v: os.homedir() + (os.platform() === 'win32' ? '\\Desktop\\' : SEP) + 'ovpns' + SEP, message: 'Download to folder:', f: v => {
        if (!(v = v.trim())) {
            throw Error
        }
        return v + (v.endsWith(SEP) ? '' : SEP)
    },
}
settingsToUse[FIXES_ENABLE_KEY] = {v: false, message: 'Apply fixes?', f: v => JSON.parse(v.trim().toLowerCase())}
settingsToUse[COUNTRIES_KEY] = {
    v: '', message: 'Countries (comma separated alpha-2 codes; empty for all):', f: v => {
        const split = v.replace(/\s/g, '').toLowerCase().split(',')
        if (split.length > 1 && split.includes('')) {
            throw Error
        }
        return split
    },
}
settingsToUse[UNATTENDED_KEY] = {v: false, f: v => JSON.parse(v.trim().toLowerCase())}
if (fs.existsSync(SETTINGS_FILE)) {
    Object.entries(parseSettings(fs.readFileSync(SETTINGS_FILE, {encoding: 'utf8'}))).forEach(it => {
        try {
            settingsToUse[it[0]].v = settingsToUse[it[0]].f(it[1])
        } catch (e) {
        }
    })
}
const it = Object.entries(settingsToUse)[Symbol.iterator]()
question(it.next(), it, settingsToUse, stats, settingsToUse[UNATTENDED_KEY].v)