const https = require('https')
const fs = require('fs')
const SEP = require('path').sep
const PLATFORM = require('os').platform()
const rl = require('readline').createInterface({input: process.stdin, output: process.stdout, completer})

const INPUT_COLOR = '\x1b[1;32m', DNL_SITE_KEY = 'dnl_site', BATCH_SIZE_KEY = 'batch_size', DIR_KEY = 'dir',
    FIXES_ENABLE_KEY = 'fixes_enable', COUNTRIES_KEY = 'langs', UNATTENDED_KEY = 'unattended'

function go(settingsToUse, stats) {
    console.time('...done')
    console.log('\x1b[0mstarted...')
    try {
        rmDirIfExistsSync(settingsToUse[DIR_KEY].v, false)
        mkDirRecursiveSync(settingsToUse[DIR_KEY].v)
        https.get(settingsToUse[DNL_SITE_KEY].v, res => {
            let a = ''

            res.on('data', data => a += data)
            res.on('end', async () => {
                const urls = a.match(/https:\/\/.+udp.+\.ovpn/g)
                if (urls) {
                    const urlsParts = []
                    let i, u

                    for (i = 0; (u = i + settingsToUse[BATCH_SIZE_KEY].v) < urls.length; i += settingsToUse[BATCH_SIZE_KEY].v) {
                        urlsParts.push(urls.slice(i, u))
                    }
                    urlsParts.push(urls.slice(i))
                    for (const urlsPart of urlsParts) {
                        u = false
                        i = await Promise.all(urlsPart.map(async it => {
                            const strings = it.split('/')
                            try {
                                return await downloadOvpnFile(it, settingsToUse[DIR_KEY].v, strings[strings.length - 1], settingsToUse,
                                    stats)
                            } catch (e) {
                                u = true
                                console.error(e)
                            }
                        }))
                        if (i = i.filter(it => it).length) {
                            console.log((u ? 'batch\x1b[1;33m' : 'batch\x1b[1;32m') + ` ${i}\x1b[0m`)
                        }
                    }
                }
                console.timeEnd('...done')
                console.log(`ok: \x1b[1;32m${stats.success}\x1b[0m, err: \x1b[1;31m${stats.failed}\x1b[0m, total: ` +
                    `\x1b[1;37m${stats.total}\x1b[0m`)
            })
        }).on('error', e => console.error('access to vpn site error:', e.message))
    } catch (e) {
        console.error('an error occurred:', e.message)
    }
}

function modify(a) {
    const l = a.length
    a = a.replace('ping-restart 0', '#ping-restart 0')
        .replace('cipher AES-256-CBC', '#cipher AES-256-CBC\ndata-ciphers-fallback AES-256-CBC')
        .replace('auth SHA512', 'auth SHA512\nblock-outside-dns\nauth-nocache')
    if (PLATFORM !== 'linux') {
        a = a.replace('fast-io', '#fast-io')
    }
    if (l !== a.length) {
        return a
    }
    throw Error('file content n/g:\n' + a + '----- EOF -----')
}

function parseSettings(fileData) {
    const settingsMap = {}
    const settingsKeys = [DNL_SITE_KEY, BATCH_SIZE_KEY, DIR_KEY, FIXES_ENABLE_KEY, COUNTRIES_KEY, UNATTENDED_KEY]

    fileData.split(fileData.includes('\r\n') ? '\r\n' : fileData.includes('\n') ? '\n' : '\r').map(it => it.split('='))
        .filter(it => it.length === 2)
        .map(it => [it[0].trim().toLowerCase(), it[1]])
        .filter(it => settingsKeys.includes(it[0]))
        .forEach(it => settingsMap[it[0]] = it[1])
    return settingsMap
}

function appendCountryFolder(path, fileName, country) {
    const split = country.split('-')
    if (!fs.existsSync(path += split[0])) {
        fs.mkdirSync(path)
    }
    if (split[1]) {
        if (!fs.existsSync(path += SEP + country)) {
            fs.mkdirSync(path)
        }
    }
    return path + SEP + fileName
}

function downloadOvpnFile(url, path, file, settingsToUse, stats) {
    return new Promise((resolve, reject) => {
        const country = file.match(/^\D+/g)[0]
        if (!settingsToUse[COUNTRIES_KEY].v.some(it => country.startsWith(it))) {
            resolve()
            return
        }
        const writeStream = fs.createWriteStream(file = appendCountryFolder(path, file, country))
        https.get(url, res => {
            let a = ''

            res.on('data', data => a += data)
            res.on('end', () => {
                try {
                    writeStream.end(settingsToUse[FIXES_ENABLE_KEY].v ? modify(a) : a, () => {
                        stats.total++
                        stats.success++
                        resolve(true)
                    })
                } catch (e) {
                    closeRemoveAndRejectWithMessage(writeStream, file, e.message, url, reject, stats)
                }
            })
        }).on('error', e => closeRemoveAndRejectWithMessage(writeStream, file, e.message, url, reject, stats))
    })
}

function closeRemoveAndRejectWithMessage(writeStream, file, msg, url, rejectFn, stats) {
    writeStream.close(() => fs.unlink(file, () => {
        stats.total++
        rejectFn(`error \x1b[1;31m${++stats.failed}\x1b[0m in https.get(${url}): \x1b[1;33m|\x1b[0m` + msg + '\x1b[1;33m|\x1b[0m')
    }))
}

function question(settingEntry, it, settingsToUse, stats, unattended) {
    if (settingEntry.done) {
        rl.close()
        go(settingsToUse, stats)
        return
    }
    if (!settingEntry.value[1].message) {
        question(it.next(), it, settingsToUse, stats, unattended)
        return
    }
    if (unattended) {
        rl.write(`\x1b[0m${settingEntry.value[1].message} ${INPUT_COLOR}${settingEntry.value[1].v}\n`)
        question(it.next(), it, settingsToUse, stats, true)
        return
    }
    rl.question(`\x1b[0m${settingEntry.value[1].message} ${INPUT_COLOR}`, answer => {
        try {
            settingsToUse[settingEntry.value[0]].v = settingsToUse[settingEntry.value[0]].f(answer)
        } catch (e) {
            question(settingEntry, it, settingsToUse, stats, false)
            return
        }
        question(it.next(), it, settingsToUse, stats, false)
    })
    rl.write(settingEntry.value[1].v + '')
}

function rmDirIfExistsSync(pathSepEnded, delLeftoverEmptyDir) {
    if (fs.existsSync(pathSepEnded)) {
        fs.readdirSync(pathSepEnded).forEach(fileName => {
            fileName = pathSepEnded + fileName
            if (fs.statSync(fileName).isDirectory()) {
                rmDirIfExistsSync(fileName + SEP, true)
                return
            }
            fs.unlinkSync(fileName)
        })
        if (delLeftoverEmptyDir) {
            fs.rmdirSync(pathSepEnded)
        }
    }
}

function mkDirRecursiveSync(pathSepEnded) {
    const segments = pathSepEnded.split(SEP)
    segments.pop()
    pathSepEnded = ''
    segments.forEach(it => {
        if (!fs.existsSync(pathSepEnded += it + SEP)) {
            fs.mkdirSync(pathSepEnded)
        }
    })
}

function completer(line) {
    const hits = [], lineLC = line.toLowerCase(), lL = line.length
    if (lineLC === 'y' || lineLC === '1') {
        hits.push('true')
    } else if (lineLC === 'n' || lineLC === '0') {
        hits.push('false')
    } else {
        hits.push(...['true', 'false'].filter(c => lL && c.startsWith(lineLC)))
    }
    if (hits.length) {
        rl.line = hits[0].substring(0, lL)
    }
    return [hits.length && hits[0].length === lL ? [] : hits, line]
}

module.exports = {DNL_SITE_KEY, BATCH_SIZE_KEY, DIR_KEY, FIXES_ENABLE_KEY, COUNTRIES_KEY, UNATTENDED_KEY, parseSettings, question}