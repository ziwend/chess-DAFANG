export function requestAPI(url, method = 'POST', data = {}, headers = {}, setData) {
    return new Promise((resolve, reject) => {
        const requestTask = wx.request({
            url,
            method,
            data,
            header: {
                'Content-Type': 'application/json',
                ...headers
            },
            success: res => {
                if (res.statusCode === 200) {
                    resolve(res.data);
                } else {
                    reject(new Error(`请求失败，状态码：${res.statusCode}`));
                }
            },
            fail: err => {
                reject(new Error(`网络错误: ${err.errMsg}`));
            },
            complete: () => {
                wx.hideLoading();
            }
        });

        // 记录请求任务
        setData({
            requestTask: requestTask
        });
    });
}