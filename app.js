const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// 设置模板引擎
app.set('view engine', 'ejs');

// 静态文件路径
app.use(express.static(path.join(__dirname, 'public')));

// 使用 body-parser 来解析表单数据
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 配置路由
const indexRouter = require('./routes/index');
app.use('/', indexRouter);

// 设置端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
