// Pure, renderer-independent checks. No values or units are inferred from filenames.
export const isScalar = value => typeof value === 'number' && Number.isFinite(value);

export function validateFieldData(result) {
  if (result?.format !== 'cae-field-v1') throw Error('文件格式不正确：需要 cae-field-v1');
  const {nodes, triangles, frames} = result;
  if (!Array.isArray(nodes) || nodes.length < 3 || !Array.isArray(triangles) || !triangles.length || !Array.isArray(frames) || !frames.length) throw Error('缺少节点、表面三角形或结果帧');
  if (nodes.length > 350000 || triangles.length > 750000 || frames.length > 150) throw Error('网页预览数据过大。请导出表面子模型或减少结果帧');
  const vector = p => Array.isArray(p) && p.length === 3 && p.every(isScalar);
  if (!nodes.every(vector)) throw Error('节点坐标必须是三个有限数值');
  for (const face of triangles) {
    if (!Array.isArray(face) || face.length !== 3 || !face.every(v => Number.isInteger(v) && v >= 0 && v < nodes.length) || new Set(face).size !== 3) throw Error('三角形包含无效或重复节点索引');
  }
  for (const [i, frame] of frames.entries()) {
    if (!Array.isArray(frame.displacement) || frame.displacement.length !== nodes.length || !frame.displacement.every(vector)) throw Error('帧 ' + (i + 1) + ' 的位移场与节点不匹配');
    if (frame.time !== undefined && !isScalar(frame.time)) throw Error('帧 ' + (i + 1) + ' 的结果域数值无效');
    if (frame.frequency !== undefined && !isScalar(frame.frequency)) throw Error('帧 ' + (i + 1) + ' 的频率无效');
    if (frame.scalars !== undefined && (!frame.scalars || Array.isArray(frame.scalars) || typeof frame.scalars !== 'object')) throw Error('场变量必须是名称与节点数组的映射');
    for (const [key, values] of Object.entries(frame.scalars || {})) {
      if (!Array.isArray(values) || values.length !== nodes.length || !values.every(v => v === null || isScalar(v))) throw Error('场变量 ' + key + ' 必须与节点数量一致，且仅包含有限数值或 null');
    }
  }
  if (result.node_labels !== undefined && (!Array.isArray(result.node_labels) || result.node_labels.length !== nodes.length)) throw Error('原始节点标签与节点数量不匹配');
  return ['U, Magnitude', ...new Set(frames.flatMap(f => Object.keys(f.scalars || {})).filter(name => name !== 'U, Magnitude'))];
}

export function fieldValues(frame, name, nodeCount) {
  return name === 'U, Magnitude' ? frame.displacement.map(u => Math.hypot(...u)) : (frame.scalars?.[name] || new Array(nodeCount).fill(null));
}

export function fieldRange(frames, name, nodeCount) {
  let min = Infinity, max = -Infinity, count = 0;
  for (const frame of frames) for (const value of fieldValues(frame, name, nodeCount)) {
    if (!isScalar(value)) continue;
    min = Math.min(min, value); max = Math.max(max, value); count++;
  }
  return count ? {min, max, count} : {min: null, max: null, count: 0};
}

export function frameDescription(result, frame, index) {
  const parts = [frame.label || (frame.step ? frame.step + ' / ' : '') + 'Frame ' + (frame.frame_index ?? index)];
  if (frame.mode !== undefined) parts.push('模态 ' + frame.mode);
  const kind = String(result.time?.kind || '').toLowerCase();
  const unit = result.time?.unit;
  if (frame.frequency !== undefined) parts.push('频率 ' + frame.frequency + ' ' + (kind === 'frequency' || kind === 'modal' ? unit || '单位未声明' : '单位未声明'));
  else if (frame.time !== undefined) {
    const label = kind === 'time' ? (result.analysis?.type === 'static' ? '静力载荷步参数' : '结果时间') : kind === 'frequency' ? '频率' : kind === 'modal' ? '模态域值' : '结果域值';
    parts.push(label + ' ' + frame.time + ' ' + (unit || '单位未声明'));
  }
  return parts.join(' · ');
}

export function metadataLines(result) {
  const status = result.validation?.status;
  const statusText = !status || status === 'not_verified' ? '尚未核验' : String(status);
  return [
    '来源：' + (result.source || '未声明') + ' / ' + (result.source_file || '未声明原始文件'),
    '文件声明的验证状态：' + statusText + '（网页不代替原生软件核验）',
    '几何范围：' + (result.geometry || '未声明'),
    '应力处理：' + (result.nodal_stress_note || '未声明平均、外推和截面位置'),
    '结果域：' + (result.time?.kind || '未声明') + ' / ' + (result.time?.unit || '单位未声明'),
    ...(result.analysis?.displacement_interpretation ? ['位移解释（导出文件声明）：' + result.analysis.displacement_interpretation] : []),
    ...(result.source_sha256 ? ['原始文件 SHA-256（导出文件声明）：' + result.source_sha256] : [])
  ];
}

export function numericCell(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : NaN;
}
