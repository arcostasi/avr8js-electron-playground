import { describe, expect, it } from 'vitest';
import { formatPlotCsv, parsePlotData, parseSeriesData } from './serial-plotter-parser';

describe('parseSeriesData', () => {
    it('parses multi-channel CSV, space, and semicolon lines while ignoring text-only lines', () => {
        const raw = [
            'Booting...',
            '10, 20.5',
            'ignore me',
            '11;21.5',
            '12 22.5',
        ].join('\n');

        expect(parseSeriesData(raw, 200)).toEqual([
            [10, 11, 12],
            [20.5, 21.5, 22.5],
        ]);
    });

    it('bounds parsing to trailing lines on large serial logs and returns exact tail values', () => {
        const lines: string[] = [];
        for (let i = 0; i < 2000; i++) {
            lines.push(`${i},${i * 2}`);
        }
        const raw = lines.join('\n') + '\n';

        const series = parseSeriesData(raw, 5);
        expect(series).toEqual([
            [1995, 1996, 1997, 1998, 1999],
            [3990, 3992, 3994, 3996, 3998],
        ]);
    });
});

describe('parsePlotData', () => {
    it('parses Arduino Serial Plotter key:value and key=value formats and retains channel labels', () => {
        const raw = [
            'temp:24.5, hum:60.2',
            'temp:25.0, hum:59.8',
            'x=10 y=-5.5',
        ].join('\n');

        expect(parsePlotData(raw, 200)).toEqual({
            labels: ['x', 'y'],
            series: [
                [24.5, 25.0, 10],
                [60.2, 59.8, -5.5],
            ],
        });
    });

    it('parses labeled pipe telemetry with units and ignores text-only lines', () => {
        const raw = [
            '7-Segment Counter Demo',
            'ADC: 352 | Voltage: 1.72 V | Position: 34 %',
            'ADC: 410 | Voltage: 2.00 V | Position: 40 %',
        ].join('\n');

        expect(parsePlotData(raw, 200)).toEqual({
            labels: ['ADC', 'Voltage', 'Position'],
            series: [
                [352, 410],
                [1.72, 2.0],
                [34, 40],
            ],
        });
    });
});

describe('formatPlotCsv', () => {
    it('exports all channels or a filtered subset as CSV', () => {
        const plotData = {
            labels: ['ADC', 'Voltage', 'Position'],
            series: [
                [352, 410],
                [1.72, 2.0],
                [34, 40],
            ],
        };

        expect(formatPlotCsv(plotData)).toBe([
            'sample,ADC,Voltage,Position',
            '0,352,1.72,34',
            '1,410,2,40',
        ].join('\n'));

        expect(formatPlotCsv(plotData, [1, 2])).toBe([
            'sample,Voltage,Position',
            '0,1.72,34',
            '1,2,40',
        ].join('\n'));
    });
});
