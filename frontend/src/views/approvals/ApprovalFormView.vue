<script setup lang="ts">
// One approval request, shown read-only in the standard form layout; the approver decides from the header.
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, EditPen } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import { fmtDateTime, fmtRp } from '../wms/wmsUi'
import {
  APPROVAL_STATUS_COLOR, APPROVAL_STATUS_LABEL, DOC_STATUS_COLOR, documentStatus, lineTotal, tableLabel, requestTotal, useApprovalStore, type ApprovalDecision,
} from '../../stores/approvalStore'

const props = defineProps<{ id: string }>()
const store = useApprovalStore()
const request = computed(() => store.get(Number(props.id)))
const isPending = computed(() => request.value?.status === 'PENDING')

const DECISIONS: Record<ApprovalDecision, { title: string; confirm: string; noteRequired: boolean; done: string }> = {
  approve: { title: 'Approve request', confirm: 'Approve', noteRequired: false, done: 'approved' },
  revise: { title: 'Send back for revision', confirm: 'Send back', noteRequired: true, done: 'sent back for revision' },
  reject: { title: 'Reject request', confirm: 'Reject', noteRequired: true, done: 'rejected' },
}

const EVENT_TYPE: Record<string, 'success' | 'danger' | 'warning'> = {
  Approved: 'success',
  Rejected: 'danger',
  'Sent back for revision': 'warning',
}

async function decide(decision: ApprovalDecision) {
  const r = request.value
  if (!r) return
  const d = DECISIONS[decision]
  let note = ''
  try {
    const result = await ElMessageBox.prompt(
      d.noteRequired ? `Tell ${r.requestedBy} why (required).` : 'Add a note for the requester (optional).',
      `${d.title} · ${r.no}`,
      {
        confirmButtonText: d.confirm,
        inputType: 'textarea',
        inputPlaceholder: d.noteRequired ? 'Reason' : 'Note',
        inputValidator: (v) => !d.noteRequired || !!v?.trim() || 'Please enter a reason',
        type: decision === 'approve' ? 'info' : 'warning',
      },
    )
    note = result.value?.trim() ?? ''
  } catch {
    return
  }
  store.decide(r.id, decision, note)
  ElMessage.success(`${r.no} ${d.done}`)
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="request?.no ?? 'Approval'"
      :breadcrumb="{ label: 'Pending Approval List', to: '/pending-approvals' }"
      show-back
    >
      <template v-if="request" #badges>
        <span class="status-pill" :class="DOC_STATUS_COLOR[documentStatus(request)]" title="Document status">{{ documentStatus(request) }}</span>
        <span v-if="request.status !== 'PENDING'" class="status-pill" :class="APPROVAL_STATUS_COLOR[request.status]" title="Approval status">{{ APPROVAL_STATUS_LABEL[request.status] }}</span>
      </template>
      <template v-if="isPending" #actions>
        <el-button type="warning" plain :icon="EditPen" @click="decide('revise')">Revise</el-button>
        <el-button type="danger" plain :icon="Close" @click="decide('reject')">Reject</el-button>
        <el-button type="primary" :icon="Check" @click="decide('approve')">Approve</el-button>
      </template>
    </PageHeader>

    <div v-if="!request" class="card">
      <el-empty description="This approval request does not exist." />
    </div>

    <div v-else class="card">
      <el-form label-position="top" class="form-grid" disabled>
        <el-form-item label="Transaction Table">
          <el-input :model-value="tableLabel(request.table)" />
        </el-form-item>
        <el-form-item label="Transaction No">
          <el-input :model-value="request.no" />
        </el-form-item>
        <el-form-item label="Request By User">
          <el-input :model-value="request.requestedBy" />
        </el-form-item>
        <el-form-item label="Request Date">
          <el-input :model-value="fmtDateTime(request.requestDate)" />
        </el-form-item>
        <el-form-item label="Division">
          <el-input :model-value="request.division" />
        </el-form-item>
        <el-form-item label="Transaction Company">
          <el-input :model-value="request.office" />
        </el-form-item>
        <el-form-item label="Counterparty">
          <el-input :model-value="request.party" />
        </el-form-item>
        <el-form-item label="Approval Level">
          <el-input :model-value="request.level" />
        </el-form-item>
        <el-form-item label="Notes" class="span-2">
          <el-input :model-value="request.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <div class="section-header">
        <div class="section-title">Items</div>
      </div>
      <el-table :data="request.lines" size="small">
        <el-table-column label="#" width="50">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="Item" prop="item" min-width="260" />
        <el-table-column label="Qty" width="140" align="right">
          <template #default="{ row }">{{ row.qty.toLocaleString('id-ID') }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="Price" width="160" align="right">
          <template #default="{ row }">{{ fmtRp(row.price) }}</template>
        </el-table-column>
        <el-table-column label="Total" width="180" align="right">
          <template #default="{ row }">{{ fmtRp(lineTotal(row)) }}</template>
        </el-table-column>
      </el-table>

      <div class="grand-total">
        <span class="grand-total-label">Grand Total</span>
        <span class="grand-total-value">{{ fmtRp(requestTotal(request)) }}</span>
      </div>

      <div class="section-header">
        <div class="section-title">Approval History</div>
      </div>
      <el-timeline class="approval-history">
        <el-timeline-item
          v-for="(e, i) in request.history"
          :key="i"
          :timestamp="fmtDateTime(e.at)"
          :type="EVENT_TYPE[e.action] ?? 'primary'"
        >
          <div class="approval-history-action">{{ e.action }} <span>by {{ e.by }}</span></div>
          <div v-if="e.note" class="approval-history-note">{{ e.note }}</div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </div>
</template>

<style scoped>
.approval-history {
  padding: 4px 0 0 4px;
}
.approval-history-action {
  font-weight: 600;
  color: var(--gray-900);
}
.approval-history-action span {
  font-weight: 400;
  color: var(--gray-500);
}
.approval-history-note {
  margin-top: 4px;
  font-size: 13px;
  color: var(--gray-700);
}
</style>
