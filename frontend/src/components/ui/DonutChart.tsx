import { ShareDonut } from '../charts/ChartKit'

export interface DonutDatum {
  label: string
  value: number
  color: string
}

/**
 * Percentage donut used on the overview. Keeps the original API (values are
 * already normalised to 100) but renders through the shared chart kit so the
 * tooltip, separators and draw-in match every other chart.
 */
export function DonutChart({
  data,
  centerLabel = 'Total',
  height = 240,
  showLegend = false,
}: {
  data: DonutDatum[]
  centerLabel?: string
  height?: number
  showLegend?: boolean
}) {
  return (
    <ShareDonut
      data={data.map((d) => ({ label: d.label, value: d.value }))}
      colors={data.map((d) => d.color)}
      height={height}
      centerLabel={centerLabel}
      centerValue={100}
      centerFormat={(n) => `${Math.round(n)}%`}
      centerCaption="share of spend"
      legend={showLegend}
      valueFormat={(n) => `${Math.round(n)}%`}
    />
  )
}
