const https = require('https')
const fs = require('fs')
const SEP = require('path').sep
const PLATFORM = require('os').platform()
const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
})

const DNL_SITE_KEY = 'dnl_site', BATCH_SIZE_KEY = 'batch_size', DIR_KEY = 'dir', FIXES_ENABLE_KEY = 'fixes_enable'

function go(settingsToUse, stats) {
    console.time('...done')
    console.log('started...')
    rmDirIfExistsSync(settingsToUse[DIR_KEY].v)
    fs.mkdirSync(settingsToUse[DIR_KEY].v)
    https.get(settingsToUse[DNL_SITE_KEY].v, res => {
        let a = ''

        res.on('data', data => a += data)
        res.on('end', async () => {
            const urls = a.match(/https:\/\/.+udp.+\.ovpn/g), urlsParts = []
            let i, u

            for (i = 0; (u = i + settingsToUse[BATCH_SIZE_KEY].v) < urls.length; i += settingsToUse[BATCH_SIZE_KEY].v) {
                urlsParts.push(urls.slice(i, u))
            }
            urlsParts.push(urls.slice(i))
            for (const urlsPart of urlsParts) {
                await Promise.all(urlsPart.map(async it => {
                    const strings = it.split('/')
                    try {
                        await downloadOvpnFile(it, settingsToUse[DIR_KEY].v + strings[strings.length - 1], settingsToUse, stats)
                    } catch (e) {
                        console.error(e)
                    }
                }))
                console.log('batch', settingsToUse[BATCH_SIZE_KEY].v)
            }
            console.timeEnd('...done')
            console.log(`ok: ${stats.success}, err: ${stats.failed}, total: ${stats.total}`)
        })
    }).on('error', err => console.error('access to vpn site error', err))
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
    throw Error('file content n/g:\n' + a + '\n-----')
}

function parseSettings(fileData) {
    const settingsMap = {}
    const settingsKeys = [DNL_SITE_KEY, BATCH_SIZE_KEY, DIR_KEY, FIXES_ENABLE_KEY]

    fileData.split(fileData.includes('\r\n') ? '\r\n' : fileData.includes('\n') ? '\n' : '\r').map(it => it.split('='))
        .filter(it => it.length === 2)
        .map(it => [it[0].trim().toLowerCase(), it[1].trim()])
        .filter(it => it[1].length)
        .filter(it => settingsKeys.includes(it[0]))
        .forEach(it => settingsMap[it[0]] = it[1])
    return settingsMap
}

function downloadOvpnFile(url, file, settingsToUse, stats) {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(file)
        https.get(url, res => {
            let a = ''

            res.on('data', data => a += data)
            res.on('end', () => {
                try {
                    writeStream.end(settingsToUse[FIXES_ENABLE_KEY].v ? modify(a) : a, () => {
                        stats.total++
                        stats.success++
                        resolve()
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
        rejectFn(++stats.failed + `, error in https.get(${url}): ` + msg)
    }))
}

function question(settingEntry, it, settingsToUse, stats) {
    if (settingEntry.done) {
        rl.close()
        go(settingsToUse, stats)
        return
    }
    rl.question(`${settingEntry.value[1].message} [\x1b[1;33m${settingEntry.value[1].v}\x1b[0m] `, answer => {
        if (answer) {
            try {
                settingsToUse[settingEntry.value[0]].v = settingsToUse[settingEntry.value[0]].f(answer)
            } catch (e) {
                question(settingEntry, it, settingsToUse, stats)
                return
            }
        }
        question(it.next(), it, settingsToUse, stats)
    })
}

function rmDirIfExistsSync(pathSepEnded) {
    if (fs.existsSync(pathSepEnded)) {
        fs.readdirSync(pathSepEnded).forEach(fileName => {
            fileName = pathSepEnded + fileName
            if (fs.statSync(fileName).isDirectory()) {
                rmDirIfExistsSync(fileName + SEP)
                return
            }
            fs.unlinkSync(fileName)
        })
        fs.rmdirSync(pathSepEnded)
    }
}

function completer(line) {
    const lineLC = line.toLowerCase()
    const hits = ['true', 'false'].filter(c => line.length && c.startsWith(lineLC))
    if (lineLC === 'y' || lineLC === '1') {
        hits.push('true')
    } else if (lineLC === 'n' || lineLC === '0') {
        hits.push('false')
    }
    if (hits.length) {
        rl.line = line.toLowerCase()
    }
    return [hits, line]
}

module.exports = {DNL_SITE_KEY, BATCH_SIZE_KEY, DIR_KEY, FIXES_ENABLE_KEY, parseSettings, question}