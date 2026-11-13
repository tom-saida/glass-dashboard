import { Col, PageGrid } from '../shell'
import { CallbacksWaiting } from './overview/CallbacksWaiting'
import { CallsByHour } from './overview/CallsByHour'
import { LatestCalls } from './overview/LatestCalls'
import { LineTile } from './overview/LineTile'
import { TodayNumbers } from './overview/TodayNumbers'

/**
 * Overview (DESIGN 6.1-6.5): Line tile + today's numbers, calls by hour, then latest calls
 * beside the callbacks waiting. Every widget is a Katie target (data-katie).
 */
export default function Overview() {
  return (
    <PageGrid>
      <Col span={4} stretch>
        <LineTile />
      </Col>
      {/* DESIGN-GLASS 4: four KPI cards, cols 5-6, 7-8, 9-10, 11-12 (TodayNumbers renders the Cols). */}
      <TodayNumbers />
      <Col span={12}>
        <CallsByHour />
      </Col>
      {/* RV-9: the two bottom cards share a bottom edge (stretch). P7: 8 + 4, so the Reason
          column keeps about 30 characters at 1280. */}
      <Col span={8} stretch>
        <LatestCalls />
      </Col>
      <Col span={4} stretch>
        <CallbacksWaiting />
      </Col>
    </PageGrid>
  )
}
