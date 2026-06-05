import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-cyan-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-teal-600">万能导入 V2</h1>
              <p className="text-sm text-gray-500 mt-1">智能多格式批量下单系统</p>
            </div>
            <nav className="flex space-x-4">
              <Link href="/import" className="px-4 py-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                文件导入
              </Link>
              <Link href="/rules" className="px-4 py-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                解析规则
              </Link>
              <Link href="/shipments" className="px-4 py-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                已导入运单
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-800 mb-4">
            AI 驱动的智能解析引擎
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            支持 Excel、Word、PDF 多种格式，通过大模型自动分析文件结构并生成解析规则，
            无需编码即可适配任意复杂格式的出库单
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border border-cyan-100">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">多格式支持</h3>
            <p className="text-gray-600">
              Excel(.xlsx/.xls)、Word(.docx)、PDF(.pdf)，智能识别文件结构
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border border-cyan-100">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">AI 规则生成</h3>
            <p className="text-gray-600">
              上传文件后 AI 自动分析结构，生成推荐规则，用户确认后即可使用
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border border-cyan-100">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">9 种复杂格式</h3>
            <p className="text-gray-600">
              干扰头部、矩阵转置、多 Sheet 合并、卡片式、纯文本等复杂场景全部兼容
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-cyan-100">
          <h3 className="text-xl font-semibold text-gray-800 mb-6 text-center">快速开始</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Link
              href="/import"
              className="group flex items-center p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg hover:from-teal-100 hover:to-cyan-100 transition-all"
            >
              <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-gray-800">上传文件导入</div>
                <div className="text-sm text-gray-600">选择已有规则或新建规则</div>
              </div>
            </Link>

            <Link
              href="/rules"
              className="group flex items-center p-4 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg hover:from-cyan-100 hover:to-blue-100 transition-all"
            >
              <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-gray-800">管理解析规则</div>
                <div className="text-sm text-gray-600">创建、编辑、测试解析规则</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6 text-center border border-cyan-100">
            <div className="text-3xl font-bold text-teal-600">9</div>
            <div className="text-gray-600 mt-1">支持的格式</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center border border-cyan-100">
            <div className="text-3xl font-bold text-teal-600">1000+</div>
            <div className="text-gray-600 mt-1">单次导入上限</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center border border-cyan-100">
            <div className="text-3xl font-bold text-teal-600">{'<10s'}</div>
            <div className="text-gray-600 mt-1">解析完成时间</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-cyan-100 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          万能导入 V2 · 智能多格式批量下单系统
        </div>
      </footer>
    </div>
  )
}
