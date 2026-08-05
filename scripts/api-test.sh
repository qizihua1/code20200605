#!/bin/bash
# V2 异步事件驱动导入系统 - 全面 API 测试脚本
BASE_URL="https://code20200605.vercel.app"
PASS=0
FAIL=0

echo "============================================"
echo "V2 异步事件驱动导入系统 API 测试"
echo "============================================"
echo "测试时间: $(date)"
echo "目标: $BASE_URL"
echo "============================================"

# 测试函数
test_api() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data="$4"
  local expected_code="$5"
  
  echo -n "测试: $name ... "
  
  if [ "$method" = "GET" ]; then
    RESPONSE=$(curl -s -o /tmp/test_response.txt -w "%{http_code}" --connect-timeout 10 --max-time 30 "$url")
  elif [ "$method" = "POST" ]; then
    if [ -n "$data" ]; then
      RESPONSE=$(curl -s -o /tmp/test_response.txt -w "%{http_code}" --connect-timeout 10 --max-time 60 -X POST "$url" -d "$data" -H "Content-Type: application/json")
    else
      RESPONSE=$(curl -s -o /tmp/test_response.txt -w "%{http_code}" --connect-timeout 10 --max-time 30 -X POST "$url")
    fi
  elif [ "$method" = "UPLOAD" ]; then
    RESPONSE=$(curl -s -o /tmp/test_response.txt -w "%{http_code}" --connect-timeout 10 --max-time 120 -X POST "$url" -F "file=@$data")
  fi
  
  if [ "$RESPONSE" = "$expected_code" ]; then
    echo "✅ PASS (HTTP $RESPONSE)"
    PASS=$((PASS + 1))
    cat /tmp/test_response.txt | python3 -c "import sys,json; d=json.load(sys.stdin); print('   响应:', json.dumps(d, ensure_ascii=False)[:100])" 2>/dev/null
  else
    echo "❌ FAIL (期望 HTTP $expected_code, 实际 HTTP $RESPONSE)"
    FAIL=$((FAIL + 1))
    cat /tmp/test_response.txt | head -c 200
    echo ""
  fi
  
  echo ""
  cat /tmp/test_response.txt
  echo ""
  echo "---"
}

# 清理临时文件
rm -f /tmp/test_response.txt

echo ""
echo "【模块一】健康检查"
echo "============================================"
test_api "首页访问" "GET" "$BASE_URL/" "" "200"
test_api "监控页面" "GET" "$BASE_URL/monitor" "" "200"
test_api "导入页面" "GET" "$BASE_URL/import" "" "200"
test_api "任务详情页面" "GET" "$BASE_URL/task/test-task-id" "" "200"

echo ""
echo "【模块二】监控 API"
echo "============================================"
test_api "监控汇总数据" "GET" "$BASE_URL/api/import-monitor/summary" "" "200"

echo ""
echo "【模块三】任务查询 API"
echo "============================================"
test_api "任务列表查询" "GET" "$BASE_URL/api/import-tasks" "" "200"
test_api "按状态筛选任务" "GET" "$BASE_URL/api/import-tasks?status=COMPLETED" "" "200"
test_api "分页查询任务" "GET" "$BASE_URL/api/import-tasks?page=1&page_size=5" "" "200"

echo ""
echo "【模块四】错误明细 API"
echo "============================================"
test_api "错误明细查询" "GET" "$BASE_URL/api/import-tasks/test-task-id/errors" "" "200"

echo ""
echo "【模块五】批次详情 API"
echo "============================================"
test_api "批次详情查询" "GET" "$BASE_URL/api/import-tasks/test-task-id/batches" "" "200"

echo ""
echo "【模块六】Trace 查询 API"
echo "============================================"
test_api "Trace 事件查询" "GET" "$BASE_URL/api/traces/test-trace-id" "" "200"

echo ""
echo "【模块七】Outbox 分发 API"
echo "============================================"
test_api "Outbox 状态查询" "GET" "$BASE_URL/api/outbox/status" "" "200"

echo ""
echo "【模块八】文件上传 API"
echo "============================================"

# 创建测试文件
python3 -c "
import json
import sys

# 创建一个简单的 Excel 文件测试
try:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '订单数据'
    ws.append(['订单号', 'SKU编码', 'SKU名称', '数量', '单价', '收件人', '联系电话', '收件地址', '规格', '备注'])
    for i in range(1, 11):
        ws.append([f'ORDER_{i:06d}', f'SKU{i % 200 + 1:04d}', f'商品{i % 200 + 1}', i * 10, f'{i * 100.5:.2f}', f'收件人{i}', f'138{12345678:08d}', f'北京市朝阳区测试地址{i}号', f'规格{(i % 5) + 1}', ''])
    wb.save('/tmp/test-upload-10rows.xlsx')
    print('测试文件已生成: /tmp/test-upload-10rows.xlsx')
except ImportError:
    print('openpyxl 未安装，使用备用方式')
" 2>&1

test_api "小文件上传" "UPLOAD" "$BASE_URL/api/import-tasks" "/tmp/test-upload-10rows.xlsx" "200"

# 提取 task_id
TASK_ID=$(cat /tmp/test_response.txt | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('task_id',''))" 2>/dev/null)

if [ -n "$TASK_ID" ]; then
    echo "✅ 上传成功! task_id: $TASK_ID"
    
    echo ""
    echo "【模块九】任务进度查询"
    echo "============================================"
    test_api "任务详情查询" "GET" "$BASE_URL/api/import-tasks/$TASK_ID" "" "200"
    test_api "批次详情查询" "GET" "$BASE_URL/api/import-tasks/$TASK_ID/batches" "" "200"
    test_api "错误明细查询" "GET" "$BASE_URL/api/import-tasks/$TASK_ID/errors" "" "200"
    
    # 提取 trace_id
    TRACE_ID=$(cat /tmp/test_response.txt | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('trace_id',''))" 2>/dev/null)
    
    if [ -n "$TRACE_ID" ]; then
        echo ""
        echo "【模块十】Trace 查询"
        echo "============================================"
        test_api "Trace 详情查询" "GET" "$BASE_URL/api/traces/$TRACE_ID" "" "200"
    fi
    
    echo ""
    echo "【模块十一】进度轮询测试"
    echo "============================================"
    echo "轮询任务状态 (最多等待 30 秒)..."
    for i in {1..6}; do
        sleep 5
        STATUS=$(curl -s "$BASE_URL/api/import-tasks/$TASK_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','UNKNOWN'))" 2>/dev/null)
        echo "  [轮询 $i] 状态: $STATUS"
        if echo "$STATUS" | grep -qE "COMPLETED|PARTIAL_SUCCESS|FAILED"; then
            echo "  任务已完成!"
            break
        fi
    done
fi

echo ""
echo "【模块十二】异常情况测试"
echo "============================================"
test_api "无文件上传 (400)" "POST" "$BASE_URL/api/import-tasks" "" "400"
test_api "不存在的任务查询 (404)" "GET" "$BASE_URL/api/import-tasks/nonexistent-task-id" "" "404"

echo ""
echo "============================================"
echo "测试完成!"
echo "通过: $PASS"
echo "失败: $FAIL"
echo "总计: $((PASS + FAIL))"
echo "通过率: $(( (PASS * 100) / (PASS + FAIL) ))%"
echo "============================================"
