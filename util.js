const https = require('https')
const fs = require('fs')

const SETTINGS_FILE_NAME = 'settings.ini', DNL_SITE_KEY = 'dnl_site', BATCH_SIZE_KEY = 'batch_size', DIR_KEY = 'dir',
    FIXES_ENABLE_KEY = 'fixes_enable'

function go(settingsToUse, stats) {
    console.time('...done')
    console.log('started...')
    if (fs.existsSync(settingsToUse[DIR_KEY].v)) {
        fs.rmSync(settingsToUse[DIR_KEY].v, {recursive: true})
    }
    fs.mkdirSync(settingsToUse[DIR_KEY].v, {recursive: true})
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
        .replace('fast-io', '#fast-io')
        .replace('cipher AES-256-CBC', '#cipher AES-256-CBC\ndata-ciphers-fallback AES-256-CBC')
        .replace('auth SHA512', 'auth SHA512\nblock-outside-dns\nauth-nocache')
    if (l !== a.length) {
        return a
    }
    throw Error('file content n/g\n' + a + '\n-----')
}

function parseSettings(fileData) {
    const settingsMap = {}

    fileData.split(fileData.includes('\r\n') ? '\r\n' : fileData.includes('\n') ? '\n' : '\r').forEach(it => {
        const split = it.split('=')
        settingsMap[split[0].toLowerCase()] = split[1]
    })
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
    writeStream.close(() => fs.rm(file, () => {
        stats.total++
        rejectFn(++stats.failed + `, error in https.get(${url}): ` + msg)
    }))
}

module.exports = {SETTINGS_FILE_NAME, DNL_SITE_KEY, BATCH_SIZE_KEY, DIR_KEY, FIXES_ENABLE_KEY, go, parseSettings}