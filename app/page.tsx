export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-blue-50 to-teal-50">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-teal-600 mb-2">
            智能多格式批量下单系统
          </h1>
          <p className="text-gray-600">
            AI 驱动的智能解析 · 支持 Excel/Word/PDF · 兼容 9 种复杂格式
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 文件上传卡片 */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">📤 文件上传</h2>
            <div className="border-2 border-dashed border-teal-300 rounded-lg p-8 text-center hover:border-teal-500 transition-colors">
              <p className="text-gray-500 mb-2">拖拽文件到此处，或点击上传</p>
              <p className="text-sm text-gray-400">支持 .xlsx, .docx, .pdf 格式</p>
              <input 
                type="file" 
                accept=".xlsx,.xls,.docx,.pdf"
                className="hidden"
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="inline-block mt-4 px-6 py-2 bg-teal-600 text-white rounded-lg cursor-pointer hover:bg-teal-700"
              >
                选择文件
              </label>
            </div>
          </div>

          {/* 功能说明卡片 */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">✨ 核心功能</h2>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="text-teal-500 mr-2">✓</span>
                AI 智能分析生成解析规则
              </li>
              <li className="flex items-center">
                <span className="text-teal-500 mr-2">✓</span>
                支持 9 种复杂格式
              </li>
              <li className="flex items-center">
                <span className="text-teal-500 mr-2">✓</span>
                类 Excel 在线编辑
              </li>
              <li className="flex items-center">
                <span className="text-teal-500 mr-2">✓</span>
                实时校验与错误提示
              </li>
              <li className="flex items-center">
                <span className="text-teal-500 mr-2">✓</span>
                批量提交下单
              </li>
            </ul>
          </div>
        </div>

        {/* 快速入口 */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/rules" className="bg-white rounded-xl shadow p-4 hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-teal-600">🔧 解析规则管理</h3>
            <p className="text-sm text-gray-500 mt-1">创建、编辑、AI 生成规则</p>
          </a>
          <a href="/shipments" className="bg-white rounded-xl shadow p-4 hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-teal-600">📋 已导入运单</h3>
            <p className="text-sm text-gray-500 mt-1">查看历史运单记录</p>
          </a>
          <a href="/preview" className="bg-white rounded-xl shadow p-4 hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-teal-600">📊 数据预览</h3>
            <p className="text-sm text-gray-500 mt-1">预览和编辑导入数据</p>
          </a>
        </div>

        <footer className="mt-8 pt-4 border-t text-center text-gray-500 text-sm">
          <p>智能批量下单系统 V2 · 部署于 Vercel</p>
        </footer>
      </div>
    </main>
  )
}
