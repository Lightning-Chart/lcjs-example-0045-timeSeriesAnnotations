const lcjs = require('@lightningchart/lcjs')
const { createProgressiveTraceGenerator } = require('@lightningchart/xydata')
const { lightningChart, Themes, AxisTickStrategies, emptyFill, emptyLine, ColorRGBA, SolidFill, SolidLine } = lcjs

const tStart = Date.UTC(2024, 0, 1, 0)
const tEnd = Date.UTC(2024, 0, 1, 24)
let channels = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
const lc = lightningChart({
            resourcesBaseUrl: new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'resources/',
        })
const chart = lc
    .ChartXY({
        defaultAxisX: { type: 'linear-highPrecision' },
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined,
    })
    .setTitle('')
chart.axisX
    .setTickStrategy(AxisTickStrategies.DateTime, (strategy) => {
        const keys = Object.keys(strategy.toJS())
        return strategy.withMutations((mutable) => {
            mutable.set('utc', true) // align ticks by GMT+0 rather than client timezone
            mutable.set('cursorFormatter', (x) =>
                new Intl.DateTimeFormat(undefined, {
                    timeZone: 'GMT',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                }).format(x),
            )
            keys.forEach((key) => {
                if (!key.includes('formatOptions')) return
                const prevValue = strategy[key]
                if (typeof prevValue === 'function') return
                mutable.set(key, { ...prevValue, timeZone: 'GMT' })
            })
        })
    })
    .setInterval({ start: tStart, end: tEnd })
    .setIntervalRestrictions((state) => ({
        startMin: state.dataMin,
        endMax: state.dataMax,
    }))
chart.axisY.dispose()
channels = channels.map((ch, i) => {
    const axisY = chart.addAxisY({ iStack: -i }).setTitle(ch.name).setTitleRotation(0).setMargins(2, 2)
    const series = chart.addPointLineAreaSeries({ dataPattern: 'ProgressiveX', axisY }).setAreaFillStyle(emptyFill)
    return { ...ch, axisY, series }
})

Promise.all(channels.map((_) => createProgressiveTraceGenerator().setNumberOfPoints(100_000).generate().toPromise())).then((dataSet) => {
    channels.forEach((ch, i) =>
        ch.series.appendJSON(dataSet[i], {
            y: 'y',
            start: tStart,
            step: (tEnd - tStart) / dataSet[i].length,
        }),
    )
})

// Annotations logic;
// Annotations - in this example - are rendered using different figure series, such as rectangle series, segment series and text series
// in order to nicely allocate a space for them and control their size in pixels, they are placed on an invisible Y axis whose height is controlled in pixels

const annotAxisY = chart
    .addAxisY({ iStack: 1 })
    .setInterval({ start: 2, end: 0 })
    .setLength({ pixels: 40 })
    .setMargins(0, 2)
    .setUserInteractions(undefined)
    .setTickStrategy(AxisTickStrategies.Empty)
    .setStrokeStyle(emptyLine)
const theme = chart.getTheme()
const fillBorder = new SolidFill({ color: theme.isDark ? ColorRGBA(255, 255, 255) : ColorRGBA(0, 0, 0) })
const strokeBorder = new SolidLine({ fillStyle: fillBorder, thickness: 2 })
const fillText = new SolidFill({ color: ColorRGBA(0, 0, 0) })
const fillsBg = theme.examples.badGoodColorPalette.map((color) => new SolidFill({ color }))
const segmentSeries = chart
    .addSegmentSeries({ axisY: annotAxisY })
    .setEffect(false)
    .setCursorEnabled(false)
    .setDefaultStyle((fig) => fig.setStrokeStyle(strokeBorder))
    .setHighlightOnHover(false)
const rectSeries = chart
    .addRectangleSeries({ axisY: annotAxisY })
    .setEffect(false)
    .setCursorEnabled(false)
    .setDefaultStyle((fig) => fig.setStrokeStyle(strokeBorder).setCornerRadius(5))
    .setHighlightOnHover(false)
    .setClipping(false)
const textSeries = chart
    .addTextSeries({ axisY: annotAxisY })
    .setEffect(false)
    .setCursorEnabled(false)
    .setDefaultStyle((fig) => fig.setFillStyle(fillText).setLabelShadow(undefined))
    .setHighlightOnHover(false)
    .setClipping(false)
    .setPointerEvents(false)
const textMargins = { left: 5, right: 5, top: 0, bottom: 0 }

const annotations = []
const Annotation = (x1, x2, posVertical, text, bgFill) => {
    const lineFigureHorizontal = segmentSeries.add({ startX: x1, endX: x2, startY: posVertical + 0.5, endY: posVertical + 0.5 })
    const lineFigureWhiskerLeft = segmentSeries.add({ startX: x1, endX: x1, startY: posVertical + 0.25, endY: posVertical + 0.75 })
    const lineFigureWhiskerRight = segmentSeries.add({ startX: x2, endX: x2, startY: posVertical + 0.25, endY: posVertical + 0.75 })
    const textFigure = textSeries.add({
        text,
        location: { x: (x1 + x2) / 2, y: posVertical },
        alignment: { x: 0, y: 1 },
        margin: textMargins,
    })
    const textSize = textFigure.getSizePixels()
    const rectFigure = rectSeries.add({ x1: 0, x2: 0, y1: 0, y2: 0 }).setFillStyle(bgFill)
    let curX1
    let curX2
    const setDimensions = (x1, x2) => {
        if (x1 > x2) {
            const temp = x1
            x1 = x2
            x2 = temp
        }
        lineFigureHorizontal.setDimensions({ startX: x1, endX: x2, startY: posVertical + 0.5, endY: posVertical + 0.5 })
        lineFigureWhiskerLeft.setDimensions({ startX: x1, endX: x1, startY: posVertical + 0.25, endY: posVertical + 0.75 })
        lineFigureWhiskerRight.setDimensions({ startX: x2, endX: x2, startY: posVertical + 0.25, endY: posVertical + 0.75 })
        textFigure.setLocation({
            x: (x1 + x2) / 2,
            y: posVertical,
        })
        const textCenterPixels = chart.translateCoordinate({ x: (x1 + x2) / 2, y: 0 }, chart.coordsAxis, chart.coordsRelative).x
        rectFigure.setDimensions({
            x1: chart.translateCoordinate({ x: textCenterPixels - textSize.x / 2, y: 0 }, chart.coordsRelative, chart.coordsAxis).x,
            x2: chart.translateCoordinate({ x: textCenterPixels + textSize.x / 2, y: 0 }, chart.coordsRelative, chart.coordsAxis).x,
            y1: posVertical,
            y2: posVertical + 1,
        })
        // Hide text + rectangle if their size would extend over the annotation time range
        const bounds = textFigure.getBoundingBox()
        if (bounds.min.x < x1 || bounds.max.x > x2) {
            textFigure.setVisible(false)
            rectFigure.setVisible(false)
        } else {
            textFigure.setVisible(true)
            rectFigure.setVisible(true)
        }
        curX1 = x1
        curX2 = x2
    }
    setDimensions(x1, x2)
    // Rectangle figures are drawn with axis coordinates, but these dimensions originate from text size as pixels. This requires recalculations whenever axis interval changes.
    chart.axisX.addEventListener('intervalchange', () => setDimensions(curX1, curX2))

    // Delete annotation on double click
    rectFigure.addEventListener('dblclick', (event) => {
        event.preventDefault()
        event.stopPropagation()
        annotations.splice(annotations.indexOf(entry), 1)
        lineFigureHorizontal.dispose()
        lineFigureWhiskerLeft.dispose()
        lineFigureWhiskerRight.dispose()
        textFigure.dispose()
        rectFigure.dispose()
    })

    // Move annotation start / end times by dragging on left or right whisker
    const startDragWhiskerInteraction = (eventDown, isX1) => {
        const handleMove = (eventMove) => {
            const x = chart.translateCoordinate(eventMove, chart.coordsAxis).x
            setDimensions(isX1 ? x : curX1, !isX1 ? x : curX2)
        }
        const handleUp = (eventUp) => {
            chart.engine.container.removeEventListener('pointermove', handleMove)
            chart.engine.container.removeEventListener('pointerup', handleUp)
        }
        chart.engine.container.addEventListener('pointermove', handleMove)
        chart.engine.container.addEventListener('pointerup', handleUp)
    }
    lineFigureWhiskerLeft.addEventListener('pointerdown', (eventDown) => startDragWhiskerInteraction(eventDown, true))
    lineFigureWhiskerRight.addEventListener('pointerdown', (eventDown) => startDragWhiskerInteraction(eventDown, false))

    const entry = { x1, x2, posVertical, setDimensions }
    annotations.push(entry)
    return entry
}
// Hard coded Annotation data just for example purposes
// In real applications this might either originate from automated data analysis processes or manual annotation processes.
// Different text or colors may indicate different meanings in the final report.
Annotation(Date.UTC(2024, 0, 1, 1), Date.UTC(2024, 0, 1, 4), 0, 'Event', fillsBg[0])
Annotation(Date.UTC(2024, 0, 1, 3, 30), Date.UTC(2024, 0, 1, 5), 1, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 4, 45), Date.UTC(2024, 0, 1, 7), 0, 'Event', fillsBg[2])
Annotation(Date.UTC(2024, 0, 1, 7, 0), Date.UTC(2024, 0, 1, 9, 30), 0, 'Event', fillsBg[0])
Annotation(Date.UTC(2024, 0, 1, 6, 0), Date.UTC(2024, 0, 1, 8, 0), 1, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 9, 30), Date.UTC(2024, 0, 1, 11, 0), 1, 'Event', fillsBg[2])
Annotation(Date.UTC(2024, 0, 1, 11, 0), Date.UTC(2024, 0, 1, 14, 0), 0, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 14, 0), Date.UTC(2024, 0, 1, 17, 0), 0, 'Event', fillsBg[0])
Annotation(Date.UTC(2024, 0, 1, 16, 45), Date.UTC(2024, 0, 1, 17, 15), 1, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 17, 15), Date.UTC(2024, 0, 1, 17, 45), 1, 'Event', fillsBg[0])
Annotation(Date.UTC(2024, 0, 1, 17, 45), Date.UTC(2024, 0, 1, 18, 30), 1, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 17, 45), Date.UTC(2024, 0, 1, 19, 0), 0, 'Event', fillsBg[2])
Annotation(Date.UTC(2024, 0, 1, 19, 0), Date.UTC(2024, 0, 1, 23, 0), 0, 'Event', fillsBg[1])
Annotation(Date.UTC(2024, 0, 1, 20, 45), Date.UTC(2024, 0, 1, 21, 15), 1, 'Event', fillsBg[0])

// Custom interaction for creating an annotation by dragging with LMB pressed
chart.setUserInteractions({
    rectangleZoom: false, // NOTE: rectangle zoom uses LMB by default. In this case it is just disabled. Just as well it could be moved to another button
})
chart.seriesBackground.addEventListener('pointerdown', (eventDown) => {
    if (eventDown.button !== 0) return
    const x1 = chart.translateCoordinate(eventDown, chart.coordsAxis).x
    const posVertical = annotations.find((item) => item.x1 <= x1 && x1 <= item.x2 && item.posVertical === 0) === undefined ? 0 : 1
    const annotation = Annotation(x1, x1, posVertical, 'Manual', fillsBg[Math.round(Math.random() * (fillsBg.length - 1))])
    const handleMove = (eventMove) => {
        const x2 = chart.translateCoordinate(eventMove, chart.coordsAxis).x
        annotation.setDimensions(x1, x2)
    }
    const handleUp = (eventUp) => {
        chart.engine.container.removeEventListener('pointermove', handleMove)
        chart.engine.container.removeEventListener('pointerup', handleUp)
    }
    chart.engine.container.addEventListener('pointermove', handleMove)
    chart.engine.container.addEventListener('pointerup', handleUp)
})
