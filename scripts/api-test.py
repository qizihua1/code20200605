#!/usr/bin/env python3
"""
V2 异步事件驱动导入系统 - 全面 API 测试脚本
在本地终端运行: python3 scripts/api-test.py
"""
import requests
import time
import json
import sys
import os
from datetime import datetime

BASE_URL = "https://code20200605.vercel.app"
PASS = 0
FAIL = 0
TEST_RESULTS = []

def log_result(name, success, status_code, response=None, error=None):
    global PASS, FAIL
    if success:
        PASS += 1
        print(f"  ✅ PASS: {name} (HTTP {status_code})")
    else:
        FAIL += 1
        print(f"  ❌ FAIL: {name} (HTTP {status_code})")
        if error:
            print(f"     错误: {error}")
    TEST_RESULTS.append({
        "name": name,
        "success": success,
        "status_code": status_code,
        "response": response,
        "error": error
    })

def test_get(name, url, expected_status=200):
    try:
        resp = requests.get(url, timeout=15)
        log_result(name, resp.status_code == expected_status, resp.status_code, resp.text[:200])
        return resp
    except Exception as e:
        log_result(name, False, 0, error=str(e))
        return None

def test_post(name, url, data=None, files=None, expected_status=200):
    try:
        if files:
            resp = requests.post(url, files=files, timeout=60)
        else:
            resp = requests.post(url, json=data, timeout=15)
        log_result(name, resp.status_code == expected_status, resp.status_code, resp.text[:200])
        return resp
    except Exception as e:
        log_result(name, False, 0, error=str(e))
        return None

def test_api():
    global PASS, FAIL
    
    print("=" * 60)
    print("V2 异步事件驱动导入系统 API 全面测试")
    print("=" * 60)
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"目标: {BASE_URL}")
    print(f"网络状态: ", end="")
    
    # 检查网络连接
    try:
        requests.get(f"{BASE_URL}/", timeout=5)
        print("✅ 可访问")
    except:
        print("❌ 无法访问，请检查网络连接")
        return
    
    print("=" * 60)
    
    # ========================================
    # 模块一：健康检查
    # ========================================
    print("\n📋 【模块一】健康检查")
    print("-" * 40)
    test_get("首页访问", f"{BASE_URL}/")
    test_get("监控页面", f"{BASE_URL}/monitor")
    test_get("导入页面", f"{BASE_URL}/import")
    
    # ========================================
    # 模块二：监控 API
    # ========================================
    print("\n📊 【模块二】监控 API")
    print("-" * 40)
    resp = test_get("监控汇总数据", f"{BASE_URL}/api/import-monitor/summary")
    if resp and resp.status_code == 200:
        data = resp.json()
        print(f"     队列事件: {data.get('queue', {}).get('pending_events', 0)}")
        print(f"     错误数量: {data.get('errors', {}).get('total_last_hour', 0)}")
        print(f"     性能指标: avg_total_ms = {data.get('performance', {}).get('avg_total_ms', 0)}ms")
    
    # ========================================
    # 模块三：任务查询 API
    # ========================================
    print("\n📝 【模块三】任务查询 API")
    print("-" * 40)
    test_get("任务列表查询", f"{BASE_URL}/api/import-tasks")
    test_get("按状态筛选", f"{BASE_URL}/api/import-tasks?status=COMPLETED")
    test_get("分页查询", f"{BASE_URL}/api/import-tasks?page=1&page_size=5")
    
    # ========================================
    # 模块四：错误明细 API
    # ========================================
    print("\n🔍 【模块四】错误明细 API")
    print("-" * 40)
    test_get("错误明细查询", f"{BASE_URL}/api/import-tasks/test-id/errors", expected_status=200)
    
    # ========================================
    # 模块五：批次详情 API
    # ========================================
    print("\n📦 【模块五】批次详情 API")
    print("-" * 40)
    # 使用存在的任务ID查询（列表第一条）
    resp = requests.get(f"{BASE_URL}/api/import-tasks", timeout=10)
    if resp.status_code == 200:
        tasks = resp.json()
        task_list = tasks.get('tasks', []) if isinstance(tasks, dict) else []
        if task_list and len(task_list) > 0:
            real_task_id = task_list[0].get('task_id', 'test-id')
            test_get(f"批次详情查询 (task_id: {real_task_id[:20]}...)", f"{BASE_URL}/api/import-tasks/{real_task_id}/batches", expected_status=200)
        else:
            test_get("批次详情查询 (无任务时)", f"{BASE_URL}/api/import-tasks/nonexistent/batches", expected_status=200)
    else:
        test_get("批次详情查询 (跳过)", f"{BASE_URL}/api/import-tasks/test-id/batches", expected_status=200)
    
    # ========================================
    # 模块六：Trace 查询 API
    # ========================================
    print("\n🔗 【模块六】Trace 查询 API")
    print("-" * 40)
    test_get("Trace 事件查询", f"{BASE_URL}/api/traces/test-trace-id", expected_status=200)
    
    # ========================================
    # 模块七：文件上传 API
    # ========================================
    print("\n📤 【模块七】文件上传 API")
    print("-" * 40)
    
    # 创建测试 Excel 文件
    test_file_path = "/tmp/test-v2-upload.xlsx"
    try:
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "订单数据"
        ws.append(["订单号", "SKU编码", "SKU名称", "数量", "单价", "收件人", "联系电话", "收件地址", "规格", "备注"])
        for i in range(1, 21):
            ws.append([
                f"ORDER_{i:06d}", f"SKU{(i % 200) + 1:04d}", f"商品{(i % 200) + 1}",
                i * 10, f"{i * 100.5:.2f}", f"收件人{i}",
                f"138{12345678:08d}", f"北京市朝阳区测试地址{i}号",
                f"规格{(i % 5) + 1}", ""
            ])
        wb.save(test_file_path)
        print(f"  已创建测试文件: {test_file_path} (20行)")
    except ImportError:
        # 使用 csv 作为备选
        import csv
        test_file_path = "/tmp/test-v2-upload.csv"
        with open(test_file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["订单号", "SKU编码", "SKU名称", "数量", "单价", "收件人", "联系电话", "收件地址", "规格", "备注"])
            for i in range(1, 21):
                writer.writerow([
                    f"ORDER_{i:06d}", f"SKU{(i % 200) + 1:04d}", f"商品{(i % 200) + 1}",
                    i * 10, f"{i * 100.5:.2f}", f"收件人{i}",
                    f"138{12345678:08d}", f"北京市朝阳区测试地址{i}号",
                    f"规格{(i % 5) + 1}", ""
                ])
        print(f"  已创建测试文件: {test_file_path} (20行, CSV格式)")
    
    # 上传文件
    with open(test_file_path, 'rb') as f:
        resp = requests.post(f"{BASE_URL}/api/import-tasks", files={"file": f}, timeout=60)
    
    upload_success = resp.status_code == 200
    log_result("文件上传 (20行)", upload_success, resp.status_code)
    
    task_id = None
    trace_id = None
    
    if upload_success:
        data = resp.json()
        task_id = data.get("task_id")
        trace_id = data.get("trace_id")
        print(f"     task_id: {task_id}")
        print(f"     trace_id: {trace_id}")
        print(f"     total_rows: {data.get('total_rows')}")
        print(f"     total_batches: {data.get('total_batches')}")
    
    # ========================================
    # 模块八：任务进度查询
    # ========================================
    if task_id:
        print(f"\n📈 【模块八】任务进度查询 (task_id: {task_id})")
        print("-" * 40)
        
        resp = test_get("任务详情查询", f"{BASE_URL}/api/import-tasks/{task_id}")
        if resp and resp.status_code == 200:
            data = resp.json()
            print(f"     状态: {data.get('status')}")
            print(f"     总行数: {data.get('total_rows')}")
            print(f"     已处理: {data.get('processed_rows')}")
            print(f"     成功: {data.get('success_rows')}")
            print(f"     失败: {data.get('failed_rows')}")
            print(f"     批次: {data.get('completed_batches')}/{data.get('total_batches')}")
        
        test_get("批次详情", f"{BASE_URL}/api/import-tasks/{task_id}/batches")
        test_get("错误明细", f"{BASE_URL}/api/import-tasks/{task_id}/errors")
        
        # 进度轮询
        print("\n    进度轮询 (等待处理完成)...")
        for i in range(1, 7):
            time.sleep(5)
            resp = requests.get(f"{BASE_URL}/api/import-tasks/{task_id}", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "UNKNOWN")
                processed = data.get("processed_rows", 0)
                total = data.get("total_rows", 0)
                print(f"    [{i}] 状态: {status} | 进度: {processed}/{total}")
                
                if status in ["COMPLETED", "PARTIAL_SUCCESS", "FAILED"]:
                    print(f"    🎯 任务处理完成!")
                    break
    
    # ========================================
    # 模块九：Trace 查询
    # ========================================
    if trace_id:
        print(f"\n🔗 【模块九】Trace 查询 (trace_id: {trace_id})")
        print("-" * 40)
        test_get("Trace 详情", f"{BASE_URL}/api/traces/{trace_id}")
    
    # ========================================
    # 模块十：异常情况测试
    # ========================================
    print("\n⚠️ 【模块十】异常情况测试")
    print("-" * 40)
    
    # 无文件上传 - 应该返回 400
    try:
        resp = requests.post(f"{BASE_URL}/api/import-tasks", timeout=10)
        log_result("无文件上传 (期望 400)", resp.status_code == 400, resp.status_code)
    except Exception as e:
        log_result("无文件上传测试", False, 0, error=str(e))
    
    # 不存在的任务查询
    test_get("不存在的任务查询", f"{BASE_URL}/api/import-tasks/nonexistent-id-12345", expected_status=404)
    
    # ========================================
    # 测试汇总
    # ========================================
    print("\n" + "=" * 60)
    print("📊 测试汇总")
    print("=" * 60)
    
    total = PASS + FAIL
    pass_rate = (PASS * 100) / total if total > 0 else 0
    
    print(f"总测试项: {total}")
    print(f"通过: {PASS} ✅")
    print(f"失败: {FAIL} ❌")
    print(f"通过率: {pass_rate:.1f}%")
    
    if FAIL > 0:
        print("\n❌ 失败项详情:")
        for result in TEST_RESULTS:
            if not result["success"]:
                print(f"  - {result['name']}")
                if result.get("error"):
                    print(f"    错误: {result['error']}")
    
    # 保存测试报告
    report = {
        "test_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "base_url": BASE_URL,
        "summary": {
            "total": total,
            "pass": PASS,
            "fail": FAIL,
            "pass_rate": f"{pass_rate:.1f}%"
        },
        "results": TEST_RESULTS
    }
    
    report_file = "/tmp/v2-api-test-report.json"
    with open(report_file, 'w') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\n📄 完整测试报告: {report_file}")
    print("=" * 60)
    
    return FAIL == 0

if __name__ == "__main__":
    success = test_api()
    sys.exit(0 if success else 1)
