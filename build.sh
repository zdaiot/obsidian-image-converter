#!/usr/bin/env bash
set -e

# 检查 node 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 node，请先安装 Node.js：https://nodejs.org"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 未找到 npm，请先安装 Node.js：https://nodejs.org"
    exit 1
fi

echo "📦 Node.js 版本：$(node -v)"
echo "📦 npm 版本：$(npm -v)"

# 安装依赖（如果 node_modules 不存在或 package.json 有更新）
if [ ! -d "node_modules" ]; then
    echo "📥 正在安装依赖..."
    npm install
else
    echo "✅ 依赖已存在，跳过安装"
fi

# 执行构建
echo "🔨 开始构建..."
npm run build

echo "🎉 构建完成！产物位于 build/ 目录"
