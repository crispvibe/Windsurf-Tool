// accountManager.js - 账号管理模块
// 负责账号列表的加载、显示、添加、删除、导出等操作

const AccountManager = {
  /**
   * 加载并显示账号列表
   */
  async loadAccounts() {
    console.log('🔄 开始加载账号列表...');
    const result = await window.ipcRenderer.invoke('get-accounts');
    console.log('📦 IPC 返回结果:', result);
    const accounts = result.success ? (result.accounts || []) : [];
    console.log('📋 账号数量:', accounts.length);
    const listEl = document.getElementById('accountsList');
    
    if (!listEl) {
      console.error('❌ 找不到 accountsList 元素');
      return;
    }
    
    if (accounts.length === 0) {
      console.log('⚠️ 没有账号数据，显示空状态');
      listEl.innerHTML = `<p style="grid-column: 1 / -1; text-align:center; color:#999; padding:20px;">${t('noAccounts')}</p>`;
      document.getElementById('accountStats').style.display = 'none';
      return;
    }
    
    console.log('✅ 开始渲染', accounts.length, '个账号');
    
    // 统计信息
    let totalCount = accounts.length;
    let activeCount = 0;
    let warningCount = 0;
    let expiredCount = 0;
    
    // 判断 Token 状态
    function getTokenStatus(account) {
      if (!account || !account.apiKey) {
        return {
          text: '未获取 Token',
          color: '#999999',
          valid: false
        };
      }
      
      if (!account.refreshToken) {
        return {
          text: 'Token 不完整',
          color: '#ff9500',
          valid: false
        };
      }
      
      return {
        text: 'Token 正常',
        color: '#34c759',
        valid: true
      };
    }
    
    // 构造表头
    let html = `
      <div class="account-item header">
        <div class="acc-col acc-col-index">#</div>
        <div class="acc-col acc-col-email">邮箱</div>
        <div class="acc-col acc-col-password">密码</div>
        <div class="acc-col acc-col-type">类型</div>
        <div class="acc-col acc-col-credits">积分</div>
        <div class="acc-col acc-col-used">已用</div>
        <div class="acc-col acc-col-usage">使用率</div>
        <div class="acc-col acc-col-expiry">到期时间</div>
        <div class="acc-col acc-col-status">Token</div>
        <div class="acc-col acc-col-actions">操作</div>
      </div>
    `;
    
    html += accounts.map((acc, index) => {
      const expiry = this.calculateExpiry(acc.createdAt, acc.expiresAt);
      const tokenStatus = getTokenStatus(acc);

      // 统计分类（只有有 expiresAt 时才统计到期状态）
      if (acc.expiresAt) {
        if (expiry.isExpired) {
          expiredCount++;
        } else if (expiry.daysLeft <= 3) {
          warningCount++;
          activeCount++;
        } else {
          activeCount++;
        }
      } else {
        // 没有到期时间的账号算作活跃
        activeCount++;
      }

      // 只有有 expiresAt 时才显示到期时间，否则显示 -
      const expiryText = acc.expiresAt && expiry.expiryDate
        ? expiry.expiryDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '-';

      const tokenStatusText = tokenStatus.text;
      const tokenStatusColor = tokenStatus.color;
      const safePassword = acc.password || '';
      const accountType = acc.type || '-';
      const accountCredits = acc.credits !== undefined ? acc.credits : '-';
      const accountUsedCredits = acc.usedCredits !== undefined ? acc.usedCredits : '-';
      const accountUsage = acc.usage !== undefined ? acc.usage + '%' : '-';
      const maskedPassword = '••••••';

      return `
        <div class="account-item" data-id="${acc.id}" data-email="${acc.email}" data-password="${safePassword}">
          <div class="acc-col acc-col-index">${index + 1}</div>
          <div class="acc-col acc-col-email" onclick="AccountManager.copyEmailText(event)" title="点击复制: ${acc.email}">${acc.email || ''}</div>
          <div class="acc-col acc-col-password" data-password="${safePassword}">
            <span class="password-display password-masked">${maskedPassword}</span>
            <span class="password-display password-text" style="display:none;" onclick="AccountManager.copyPasswordText(event)" title="点击复制密码">${safePassword}</span>
            <button class="password-toggle" onclick="AccountManager.togglePassword(event)" title="显示/隐藏密码">
              <i data-lucide="eye" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
          <div class="acc-col acc-col-type">${accountType || '-'}</div>
          <div class="acc-col acc-col-credits">${accountCredits}</div>
          <div class="acc-col acc-col-used">${accountUsedCredits}</div>
          <div class="acc-col acc-col-usage">${accountUsage}</div>
          <div class="acc-col acc-col-expiry">${expiryText}</div>
          <div class="acc-col acc-col-status" style="color:${tokenStatusColor};">${tokenStatusText}</div>
          <div class="acc-col acc-col-actions">
            ${!acc.apiKey || !acc.refreshToken ? `
              <!-- Token 不完整时只显示获取 Token 和删除按钮 -->
              <button class="acc-btn-icon" data-tooltip="获取 Token" data-id="${acc.id}" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="AccountManager.getAccountToken(event)" style="color: #007aff;">
                <i data-lucide="key" style="width: 13px; height: 13px;"></i>
              </button>
              <button class="acc-btn-icon acc-btn-danger" data-tooltip="删除账号" data-id="${acc.id}" data-email="${acc.email}" onclick="AccountManager.deleteAccount(event)">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            ` : `
              <!-- Token 完整时显示所有操作按钮 -->
              <button class="acc-btn-icon" data-tooltip="切换账号" data-id="${acc.id}" data-email="${acc.email}" data-password="${safePassword}" onclick="AccountManager.switchAccount(event)">
                <i data-lucide="user" style="width: 13px; height: 13px; color: #6e6e73;"></i>
              </button>
              <button class="acc-btn-icon" data-tooltip="查看完整信息" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="AccountManager.viewAccountDetails(event)">
                <i data-lucide="eye" style="width: 13px; height: 13px; color: #6e6e73;"></i>
              </button>
              <button class="acc-btn-icon" data-tooltip="刷新积分" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="AccountManager.refreshAccountInfo(event)">
                <i data-lucide="refresh-cw" style="width: 13px; height: 13px; color: #6e6e73;"></i>
              </button>
              <button class="acc-btn-icon" data-tooltip="导出账号" data-account='${JSON.stringify(acc).replace(/'/g, "&apos;")}' onclick="AccountManager.exportSingleAccount(event)">
                <i data-lucide="download" style="width: 13px; height: 13px; color: #6e6e73;"></i>
              </button>
              <button class="acc-btn-icon acc-btn-danger" data-tooltip="删除账号" data-id="${acc.id}" data-email="${acc.email}" onclick="AccountManager.deleteAccount(event)">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;
    
    // 初始化Lucide图标（延迟执行确保DOM完全渲染）
    if (typeof lucide !== 'undefined') {
      // 使用 requestAnimationFrame 确保在下一帧渲染
      requestAnimationFrame(() => {
        lucide.createIcons();
        console.log('✅ 图标初始化完成');
      });
    }
    
    // 绑定右键菜单
    const accountRows = listEl.querySelectorAll('.account-item:not(.header)');
    accountRows.forEach(row => {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // 使用 data-email 属性获取原始邮箱,避免复制后文本变化的问题
        const email = row.getAttribute('data-email');
        const account = accounts.find(acc => acc.email === email);
        if (account) {
          this.showAccountContextMenu(e, account);
        }
      });
    });
    
    // 更新统计信息
    document.getElementById('accountStats').style.display = 'block';
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('warningCount').textContent = warningCount;
    document.getElementById('expiredCount').textContent = expiredCount;
    
    // 加载完成后，标记当前登录的账号（延迟确保DOM完全渲染）
    if (typeof updateAccountListWithCurrent === 'function') {
      setTimeout(() => {
        updateAccountListWithCurrent();
      }, 200);  // 增加延迟到200ms
    }
  },

  /**
   * 计算账号到期时间
   * 优先使用 API 返回的 expiresAt，否则根据创建时间计算（13天）
   */
  calculateExpiry(createdAt, expiresAt) {
    let expiry;
    
    // 优先使用 API 返回的到期时间
    if (expiresAt) {
      expiry = new Date(expiresAt);
    } else if (createdAt) {
      // 如果没有 expiresAt，根据创建时间计算（13天）
      const created = new Date(createdAt);
      expiry = new Date(created);
      expiry.setDate(expiry.getDate() + 13);
    } else {
      // 没有任何时间信息
      return {
        expiryDate: null,
        daysLeft: 0,
        isExpired: true,
        expiryText: t('expired'),
        expiryColor: '#e74c3c'
      };
    }
    
    const now = new Date();
    const diffTime = expiry - now;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isExpired = daysLeft <= 0;
    
    return {
      expiryDate: expiry,
      daysLeft,
      isExpired,
      expiryText: isExpired ? t('expired') : `${t('daysLeft')}${daysLeft}${t('days')}`,
      expiryColor: isExpired ? '#e74c3c' : (daysLeft <= 3 ? '#ff9500' : '#007aff')
    };
  },

  /**
   * 显示添加账号表单
   */
  showAddAccountForm() {
    const modal = document.getElementById('addAccountModal');
    if (modal) {
      modal.classList.add('active');
      // 聚焦到邮箱输入框
      setTimeout(() => {
        const emailInput = document.getElementById('manualEmail');
        if (emailInput) emailInput.focus();
      }, 100);
    }
  },

  /**
   * 隐藏添加账号表单
   */
  hideAddAccountForm() {
    const modal = document.getElementById('addAccountModal');
    if (modal) modal.classList.remove('active');
    
    // 清空输入框（安全检查）
    const emailInput = document.getElementById('manualEmail');
    const passwordInput = document.getElementById('manualPassword');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    const apiKeyInput = document.getElementById('manualApiKey');
    if (apiKeyInput) apiKeyInput.value = '';
  },

  /**
   * 手动添加账号
   */
  async addManualAccount() {
    const email = document.getElementById('manualEmail').value;
    const password = document.getElementById('manualPassword').value;
    const apiKeyInput = document.getElementById('manualApiKey');
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    
    if (!email || !password) {
      alert(t('pleaseEnterEmailAndPassword'));
      return;
    }
    
    // 构建账号对象
    const accountData = {
      email,
      password
    };
    
    // 如果有 API Key，添加到账号数据中
    if (apiKey) {
      accountData.apiKey = apiKey;
    }
    
    const result = await window.ipcRenderer.invoke('add-account', accountData);
    
    if (result.success) {
      alert(t('addSuccess'));
      this.hideAddAccountForm();
      this.loadAccounts();
    } else {
      alert(t('addFailed') + ': ' + result.error);
    }
  },

  /**
   * 删除账号
   */
  async deleteAccount(event) {
    event.stopPropagation();
    
    const btn = event.target.closest('button');
    if (!btn) {
      console.error('找不到删除按钮');
      return;
    }
    
    const id = btn.getAttribute('data-id');
    const email = btn.getAttribute('data-email');
    
    if (!id) {
      console.error('账号ID不存在');
      alert('无法删除：账号ID不存在');
      return;
    }
    
    // 二次确认
    if (!confirm(`⚠️ 确定要删除账号吗？\n\n邮箱：${email || '未知'}\n\n此操作无法撤销！`)) {
      return;
    }
    
    try {
      const result = await window.ipcRenderer.invoke('delete-account', id);
      
      if (result.success) {
        // 刷新列表
        await this.loadAccounts();
        
        // 显示成功提示
        if (typeof showToast === 'function') {
          showToast('✅ 删除成功！', 'success');
        } else {
          alert('删除成功！');
        }
      } else {
        throw new Error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除账号失败:', error);
      alert('删除失败：' + error.message);
    }
  },

  /**
   * 删除全部账号
   */
  async deleteAllAccounts() {
    try {
      // 获取账号列表
      const result = await window.ipcRenderer.invoke('get-accounts');
      
      if (!result.success) {
        throw new Error(result.error || '获取账号列表失败');
      }
      
      if (!result.accounts || result.accounts.length === 0) {
        alert('📭 当前没有账号可删除');
        return;
      }
      
      const accountCount = result.accounts.length;
      
      // 第一次确认
      if (!confirm(`⚠️ 警告：此操作将删除全部 ${accountCount} 个账号！\n\n删除后无法恢复，确定要继续吗？`)) {
        return;
      }
      
      // 第二次确认（最后确认）
      if (!confirm(`🔴 最后确认：真的要删除全部 ${accountCount} 个账号吗？\n\n请再次确认！`)) {
        return;
      }
      
      // 执行删除
      const deleteResult = await window.ipcRenderer.invoke('delete-all-accounts');
      
      if (deleteResult.success) {
        // 刷新列表
        await this.loadAccounts();
        
        // 显示成功提示
        if (typeof showToast === 'function') {
          showToast(`✅ 成功删除了 ${accountCount} 个账号`, 'success');
        } else {
          alert(`✅ 成功删除了 ${accountCount} 个账号`);
        }
      } else {
        throw new Error(deleteResult.error || '删除失败');
      }
    } catch (error) {
      console.error('删除全部账号失败:', error);
      alert('❌ 删除失败：' + error.message);
    }
  },

  /**
   * 导出账号 - 支持分类导出
   * @param {string} type - 导出类型: 'all'(全部), 'pro'(Pro账号), 'free'(Free账号)
   */
  async exportAccounts(type = 'all') {
    try {
      const result = await window.ipcRenderer.invoke('get-accounts');
      
      if (!result.success || !result.accounts || result.accounts.length === 0) {
        alert('📭 没有账号可导出');
        return;
      }
      
      let accounts = result.accounts;
      let exportTypeName = '全部';
      
      // 根据类型筛选账号
      if (type === 'pro') {
        accounts = accounts.filter(acc => acc.type && acc.type.toLowerCase() === 'pro');
        exportTypeName = 'Pro';
        if (accounts.length === 0) {
          alert('📭 没有Pro账号可导出');
          return;
        }
      } else if (type === 'free') {
        accounts = accounts.filter(acc => !acc.type || acc.type.toLowerCase() === 'free' || acc.type === '-');
        exportTypeName = 'Free';
        if (accounts.length === 0) {
          alert('📭 没有Free账号可导出');
          return;
        }
      }
      
      // 构建导出数据（JSON 格式）
      const exportData = {
        exportTime: new Date().toISOString(),
        exportTimeLocal: new Date().toLocaleString('zh-CN'),
        totalCount: accounts.length,
        accounts: accounts.map(acc => ({
          id: acc.id,
          email: acc.email,
          password: acc.password,
          firstName: acc.firstName,
          lastName: acc.lastName,
          name: acc.name,
          apiKey: acc.apiKey,
          apiServerUrl: acc.apiServerUrl,
          refreshToken: acc.refreshToken,
          createdAt: acc.createdAt,
          type: acc.type,
          credits: acc.credits,
          usage: acc.usage
        }))
      };
      
      // 转换为格式化的 JSON 字符串
      const jsonContent = JSON.stringify(exportData, null, 2);
      
      // 根据类型生成文件名
      const typePrefix = type === 'pro' ? 'pro' : type === 'free' ? 'free' : 'all';
      const defaultFileName = `windsurf-accounts-${typePrefix}-${Date.now()}.json`;
      
      const saveResult = await window.ipcRenderer.invoke('save-file-dialog', {
        title: `导出${exportTypeName}账号`,
        defaultPath: defaultFileName,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        content: jsonContent
      });
      
      if (saveResult.success) {
        if (typeof showToast === 'function') {
          showToast(`✅ 成功导出 ${accounts.length} 个${exportTypeName}账号`, 'success');
        } else {
          alert(`✅ 账号已成功导出到:\n${saveResult.filePath}\n\n共导出 ${accounts.length} 个${exportTypeName}账号`);
        }
      } else if (saveResult.cancelled) {
        // 用户取消了保存
      } else {
        throw new Error(saveResult.error || '保存失败');
      }
    } catch (error) {
      console.error('导出账号失败:', error);
      alert('❌ 导出失败: ' + error.message);
    }
  },

  /**
   * 导出单个账号 - 导出为 JSON 格式
   */
  async exportSingleAccount(event) {
    const btn = event.target.closest('button');
    const accountData = btn.getAttribute('data-account');
    
    try {
      const account = JSON.parse(accountData);
      
      // 构建导出数据（JSON 格式，包含该账号的所有信息）
      const exportData = {
        exportTime: new Date().toISOString(),
        exportTimeLocal: new Date().toLocaleString('zh-CN'),
        account: {
          id: account.id,
          email: account.email,
          password: account.password,
          firstName: account.firstName,
          lastName: account.lastName,
          name: account.name,
          apiKey: account.apiKey,
          apiServerUrl: account.apiServerUrl,
          refreshToken: account.refreshToken,
          createdAt: account.createdAt,
          type: account.type,
          credits: account.credits,
          usage: account.usage
        }
      };
      
      // 转换为格式化的 JSON 字符串
      const jsonContent = JSON.stringify(exportData, null, 2);
      
      const saveResult = await window.ipcRenderer.invoke('save-file-dialog', {
        title: '导出账号',
        defaultPath: `windsurf-account-${account.email.replace('@', '_')}-${Date.now()}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        content: jsonContent
      });
      
      if (saveResult.success) {
        if (typeof showToast === 'function') {
          showToast('✅ 账号已导出', 'success');
        } else {
          alert(`✅ 账号已成功导出到:\n${saveResult.filePath}`);
        }
      } else if (saveResult.cancelled) {
        // 用户取消了保存
      } else {
        throw new Error(saveResult.error || '保存失败');
      }
    } catch (error) {
      console.error('导出账号失败:', error);
      alert('❌ 导出失败: ' + error.message);
    }
  },

  /**
   * 切换账号 - 使用 accountSwitcher.js 模块
   */
  async switchAccount(event) {
    const btn = event.target.closest('button');
    const accountId = btn.getAttribute('data-id');
    
    // 调用 accountSwitcher.js 中的全局函数
    if (typeof switchToAccount === 'function') {
      await switchToAccount(accountId);
    } else {
      console.error('switchToAccount 函数未找到，请确保 accountSwitcher.js 已加载');
      alert('切换账号功能未加载，请刷新页面重试');
    }
  },

  /**
   * 查看账号详情 - 使用模态框展示
   */
  viewAccountDetails(event) {
    const btn = event.target.closest('button');
    const accountData = btn.getAttribute('data-account');
    
    try {
      const account = JSON.parse(accountData);
      
      // 创建模态框
      const modal = document.createElement('div');
      modal.className = 'modal-overlay active';
      modal.style.zIndex = '10000';
      
      const expiry = this.calculateExpiry(account.createdAt, account.expiresAt);
      
      // 格式化到期时间显示（只有有 expiresAt 时才显示）
      let expiryDisplay = '-';
      if (account.expiresAt && expiry.expiryDate) {
        const dateStr = expiry.expiryDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        if (expiry.isExpired) {
          expiryDisplay = `${dateStr} (已过期)`;
        } else {
          expiryDisplay = `${dateStr} (剩余${expiry.daysLeft}天)`;
        }
      }
      
      modal.innerHTML = `
        <div class="modal-dialog modern-modal" style="max-width: 600px;" onclick="event.stopPropagation()">
          <div class="modern-modal-header">
            <div class="modal-title-row">
              <i data-lucide="user-circle" style="width: 24px; height: 24px; color: #007aff;"></i>
              <h3 class="modal-title">账号详细信息</h3>
            </div>
            <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()" title="关闭">
              <i data-lucide="x" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          
          <div class="modern-modal-body" style="max-height: 70vh; overflow-y: auto;">
            <div style="display: grid; gap: 16px;">
              <!-- 基本信息 -->
              <div style="background: #f5f5f7; padding: 16px; border-radius: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #86868b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="info" style="width: 16px; height: 16px;"></i>
                  基本信息
                </h4>
                <div style="display: grid; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
                      邮箱
                    </span>
                    <span style="font-weight: 500; font-size: 13px; word-break: break-all; text-align: right; max-width: 70%;">${account.email || '未知'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="key" style="width: 14px; height: 14px;"></i>
                      密码
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.password || '未设置'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="user" style="width: 14px; height: 14px;"></i>
                      姓名
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.name || account.firstName && account.lastName ? (account.firstName + ' ' + account.lastName) : '未设置'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
                      账号ID
                    </span>
                    <span style="font-weight: 500; font-size: 13px; font-family: monospace;">${account.id || '未知'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                      创建时间
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.createdAt ? new Date(account.createdAt).toLocaleString('zh-CN') : '未知'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
                      到期时间
                    </span>
                    <span style="font-weight: 500; font-size: 13px; color: ${expiry.expiryColor};">${expiryDisplay}</span>
                  </div>
                </div>
              </div>
              
              <!-- 订阅信息 -->
              <div style="background: #f5f5f7; padding: 16px; border-radius: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #86868b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="award" style="width: 16px; height: 16px;"></i>
                  订阅信息
                </h4>
                <div style="display: grid; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="tag" style="width: 14px; height: 14px;"></i>
                      订阅类型
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.type || '-'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="coins" style="width: 14px; height: 14px;"></i>
                      剩余积分
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.credits !== undefined ? account.credits : '-'}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #86868b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                      <i data-lucide="activity" style="width: 14px; height: 14px;"></i>
                      使用率
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${account.usage !== undefined ? account.usage + '%' : '-'}</span>
                  </div>
                </div>
              </div>
              
              ${account.apiKey ? `
              <!-- API Key -->
              <div style="background: #f5f5f7; padding: 16px; border-radius: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #86868b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="shield" style="width: 16px; height: 16px;"></i>
                  API Key
                </h4>
                <div style="background: white; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; word-break: break-all; line-height: 1.6;">
                  ${account.apiKey}
                </div>
                <button onclick="AccountManager.copyToClipboard('${account.apiKey}').then(() => { if(typeof showToast === 'function') showToast('API Key 已复制', 'success'); else alert('已复制'); })" 
                  style="margin-top: 8px; padding: 6px 12px; background: #007aff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                  <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                  复制 API Key
                </button>
              </div>
              ` : ''}
              
              ${account.refreshToken ? `
              <!-- Refresh Token -->
              <div style="background: #f5f5f7; padding: 16px; border-radius: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #86868b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                  Refresh Token
                </h4>
                <div style="background: white; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; word-break: break-all; line-height: 1.6;">
                  ${account.refreshToken}
                </div>
                <button onclick="AccountManager.copyToClipboard('${account.refreshToken}').then(() => { if(typeof showToast === 'function') showToast('Refresh Token 已复制', 'success'); else alert('已复制'); })" 
                  style="margin-top: 8px; padding: 6px 12px; background: #007aff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                  <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                  复制 Refresh Token
                </button>
              </div>
              ` : ''}
              
              ${account.apiServerUrl ? `
              <!-- API Server -->
              <div style="background: #f5f5f7; padding: 16px; border-radius: 12px;">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #86868b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="server" style="width: 16px; height: 16px;"></i>
                  API Server
                </h4>
                <div style="background: white; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px;">
                  ${account.apiServerUrl}
                </div>
              </div>
              ` : ''}
            </div>
          </div>
          
          <div class="modern-modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
              关闭
            </button>
          </div>
        </div>
      `;
      
      // 点击背景关闭
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      };
      
      document.body.appendChild(modal);
      
      // 初始化图标
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } catch (error) {
      console.error('查看账号详情失败:', error);
      alert('查看详情失败: ' + error.message);
    }
  },

  /**
   * 刷新账号信息 - 查询积分并更新到 JSON 文件
   */
  async refreshAccountInfo(event) {
    const btn = event.target.closest('button');
    const accountData = btn.getAttribute('data-account');
    
    try {
      const account = JSON.parse(accountData);
      
      // 检查 AccountQuery 模块是否已加载
      if (typeof window.AccountQuery === 'undefined') {
        console.error('AccountQuery 模块未加载');
        alert('查询模块未加载，请刷新页面重试');
        return;
      }
      
      if (!account.refreshToken) {
        alert('该账号缺少 refreshToken，无法刷新');
        return;
      }
      
      if (typeof showToast === 'function') {
        showToast('正在刷新账号信息...', 'info');
      }
      
      // 使用 accountQuery.js 中的 queryAccount 方法
      let queryResult = await window.AccountQuery.queryAccount(account);
      
      // 如果 RefreshToken 过期,尝试用邮箱密码重新获取 Token
      if (!queryResult.success && queryResult.error && queryResult.error.includes('RefreshToken 已过期')) {
        if (typeof showToast === 'function') {
          showToast('检测到 Token 过期,正在重新获取...', 'info');
        }
        
        // 检查是否有邮箱和密码
        if (account.email && account.password) {
          try {
            // 调用主进程的获取 Token 方法
            const loginResult = await window.ipcRenderer.invoke('get-account-token', {
              email: account.email,
              password: account.password
            });
            
            if (loginResult.success && loginResult.account) {
              // 更新账号的 Token 信息
              const tokenUpdateResult = await window.ipcRenderer.invoke('update-account', {
                id: account.id,
                apiKey: loginResult.account.apiKey,
                refreshToken: loginResult.account.refreshToken,
                idToken: loginResult.account.idToken,
                idTokenExpiresAt: loginResult.account.idTokenExpiresAt,
                name: loginResult.account.name,
                apiServerUrl: loginResult.account.apiServerUrl
              });
              
              if (tokenUpdateResult.success) {
                if (typeof showToast === 'function') {
                  showToast('Token 重新获取成功,继续刷新...', 'success');
                }
                
                // 重新加载账号信息
                const accountsResult = await window.ipcRenderer.invoke('get-accounts');
                const updatedAccount = accountsResult.accounts.find(acc => acc.id === account.id);
                
                // 再次查询积分
                queryResult = await window.AccountQuery.queryAccount(updatedAccount);
              }
            } else {
              throw new Error(loginResult.error || '获取 Token 失败');
            }
          } catch (error) {
            console.error('自动重新获取 Token 失败:', error);
            if (typeof showToast === 'function') {
              showToast('自动获取 Token 失败: ' + error.message, 'error');
            }
          }
        } else {
          if (typeof showToast === 'function') {
            showToast('账号缺少密码,无法自动重新获取 Token', 'error');
          }
        }
      }
      
      if (queryResult.success) {
        // 准备更新的账号数据
        const updatedAccount = {
          id: account.id,
          type: queryResult.planName || account.type || '-',
          credits: queryResult.totalCredits || 0, // 总积分
          usage: queryResult.usagePercentage || 0, // 使用率
          totalCredits: queryResult.totalCredits || 0,
          usedCredits: queryResult.usedCredits || 0,
          expiresAt: queryResult.expiresAt || null // 保存到期时间
        };
        
        // 如果查询结果包含新的 Token 信息,也一起更新
        if (queryResult.newTokenData) {
          updatedAccount.idToken = queryResult.newTokenData.idToken;
          updatedAccount.idTokenExpiresAt = queryResult.newTokenData.idTokenExpiresAt;
          updatedAccount.refreshToken = queryResult.newTokenData.refreshToken;
        }
        
        // 调用 IPC 更新账号信息到 JSON 文件
        const updateResult = await window.ipcRenderer.invoke('update-account', updatedAccount);
        
        if (updateResult.success) {
          // 刷新列表显示
          await this.loadAccounts();
          
          if (typeof showToast === 'function') {
            showToast(`✅ 刷新成功！类型: ${updatedAccount.type}, 总积分: ${updatedAccount.credits}`, 'success');
          } else {
            alert(`刷新成功！\n类型: ${updatedAccount.type}\n总积分: ${updatedAccount.credits}\n使用率: ${updatedAccount.usage}%`);
          }
        } else {
          throw new Error(updateResult.error || '更新账号信息失败');
        }
      } else {
        alert('刷新失败：' + (queryResult.error || '未知错误'));
      }
    } catch (error) {
      console.error('刷新账号信息失败:', error);
      alert('刷新失败: ' + error.message);
    }
  },

  /**
   * 切换密码显示/隐藏
   */
  togglePassword(event) {
    // 阻止事件冒泡
    event.stopPropagation();
    
    // 获取按钮元素
    const btn = event.target.closest('button.password-toggle');
    if (!btn) {
      console.error('找不到密码切换按钮');
      return;
    }
    
    // 获取密码列
    const passwordCol = btn.closest('.acc-col-password');
    if (!passwordCol) {
      console.error('找不到密码列元素');
      return;
    }
    
    const masked = passwordCol.querySelector('.password-masked');
    const text = passwordCol.querySelector('.password-text');
    const icon = btn.querySelector('i');
    
    if (!masked || !text) {
      console.error('找不到密码显示元素');
      return;
    }
    
    // 切换显示状态
    if (masked.style.display !== 'none') {
      masked.style.display = 'none';
      text.style.display = 'inline';
      if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
      masked.style.display = 'inline';
      text.style.display = 'none';
      if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    
    // 重新初始化图标（只初始化当前按钮的图标）
    if (typeof lucide !== 'undefined' && icon) {
      requestAnimationFrame(() => {
        lucide.createIcons({ icons: { eye: lucide.icons.Eye, 'eye-off': lucide.icons.EyeOff }, nameAttr: 'data-lucide' });
      });
    }
  },

  /**
   * 复制邮箱
   */
  async copyEmailText(event) {
    event.stopPropagation();
    
    const emailEl = event.target.closest('.acc-col-email');
    if (!emailEl) {
      console.error('找不到邮箱元素');
      return;
    }
    
    // 先保存原始文本和颜色
    const originalText = emailEl.textContent.trim();
    const originalColor = emailEl.style.color;
    
    try {
      await this.copyToClipboard(originalText);
      
      emailEl.textContent = '✓ 已复制';
      emailEl.style.color = '#34c759';
      
      setTimeout(() => {
        emailEl.textContent = originalText;
        emailEl.style.color = originalColor;
      }, 1000);
    } catch (error) {
      console.error('复制邮箱失败:', error);
      alert('复制失败: ' + error.message);
    }
  },

  /**
   * 复制密码
   */
  async copyPasswordText(event) {
    event.stopPropagation();
    
    const passwordEl = event.target.closest('.password-text');
    if (!passwordEl) {
      console.error('找不到密码文本元素');
      return;
    }
    
    const password = passwordEl.textContent.trim();
    
    try {
      await this.copyToClipboard(password);
      
      const originalText = passwordEl.textContent;
      const originalColor = passwordEl.style.color;
      
      passwordEl.textContent = '✓ 已复制';
      passwordEl.style.color = '#34c759';
      
      setTimeout(() => {
        passwordEl.textContent = originalText;
        passwordEl.style.color = originalColor;
      }, 1000);
    } catch (error) {
      console.error('复制密码失败:', error);
      alert('复制失败: ' + error.message);
    }
  },

  /**
   * 复制到剪贴板
   */
  async copyToClipboard(text) {
    try {
      const result = await window.ipcRenderer.invoke('copy-to-clipboard', text);
      if (!result.success) {
        throw new Error(result.error || '复制失败');
      }
    } catch (error) {
      console.error('复制失败:', error);
      throw error;
    }
  },

  /**
   * 显示导入账号表单 - 调用 renderer.js 中的实现
   * 注意：导入账号的完整实现在 renderer.js 中
   */
  showImportAccountForm() {
    // 直接调用全局函数（在 renderer.js 中定义）
    // 由于这个方法不会被全局包装器覆盖，所以不会递归
    const globalFunc = window['showImportAccountForm'];
    if (globalFunc && globalFunc !== this.showImportAccountForm) {
      globalFunc();
    } else {
      console.error('导入账号功能未找到');
      alert('导入功能未加载，请刷新页面重试');
    }
  },

  /**
   * 显示账号右键菜单
   */
  showAccountContextMenu(event, account) {
    // 移除已存在的菜单
    const existingMenu = document.getElementById('accountContextMenu');
    if (existingMenu) existingMenu.remove();
    
    // 转义账号数据用于 HTML 属性
    const accountJson = JSON.stringify(account).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    
    const menuHTML = `
      <div id="accountContextMenu" style="position: fixed; background: white; border: 1px solid #e5e5ea; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; min-width: 180px; visibility: hidden;">
        <div class="context-menu-item" onclick="AccountManager.contextMenuViewDetails('${account.id}')">
          <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
          <span>查看详情</span>
        </div>
        ${account.refreshToken ? `
        <div class="context-menu-item" onclick="AccountManager.contextMenuRefresh('${account.id}')">
          <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
          <span>刷新积分</span>
        </div>
        ` : ''}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="AccountManager.contextMenuSwitch('${account.id}')">
          <i data-lucide="repeat" style="width: 16px; height: 16px;"></i>
          <span>切换账号</span>
        </div>
        <div class="context-menu-item" onclick="AccountManager.contextMenuExport('${account.id}')">
          <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          <span>导出账号</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="AccountManager.copyToClipboard('${account.email.replace(/'/g, "\\'")}').then(() => { if(typeof showToast === 'function') showToast('邮箱已复制', 'success'); }); AccountManager.closeContextMenu();">
          <i data-lucide="mail" style="width: 16px; height: 16px;"></i>
          <span>复制邮箱</span>
        </div>
        <div class="context-menu-item" onclick="AccountManager.copyToClipboard('${(account.password || '').replace(/'/g, "\\'")}').then(() => { if(typeof showToast === 'function') showToast('密码已复制', 'success'); }); AccountManager.closeContextMenu();">
          <i data-lucide="key" style="width: 16px; height: 16px;"></i>
          <span>复制密码</span>
        </div>
        ${account.apiKey ? `
        <div class="context-menu-item" onclick="AccountManager.copyToClipboard('${account.apiKey.replace(/'/g, "\\'")}').then(() => { if(typeof showToast === 'function') showToast('API Key 已复制', 'success'); }); AccountManager.closeContextMenu();">
          <i data-lucide="code" style="width: 16px; height: 16px;"></i>
          <span>复制 API Key</span>
        </div>
        ` : ''}
        ${account.refreshToken ? `
        <div class="context-menu-item" onclick="AccountManager.copyToClipboard('${account.refreshToken.replace(/'/g, "\\'")}').then(() => { if(typeof showToast === 'function') showToast('Refresh Token 已复制', 'success'); }); AccountManager.closeContextMenu();">
          <i data-lucide="shield" style="width: 16px; height: 16px;"></i>
          <span>复制 Refresh Token</span>
        </div>
        ` : ''}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" style="color: #ff3b30;" onclick="AccountManager.contextMenuDelete('${account.id}', '${account.email.replace(/'/g, "\\'")}')">
          <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
          <span>删除账号</span>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', menuHTML);
    
    // 智能定位菜单
    const menu = document.getElementById('accountContextMenu');
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.clientX;
    let top = event.clientY;
    
    // 检查右侧是否超出屏幕
    if (left + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 10; // 留10px边距
    }
    
    // 检查底部是否超出屏幕
    if (top + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 10; // 留10px边距
    }
    
    // 确保不超出左侧和顶部
    if (left < 10) left = 10;
    if (top < 10) top = 10;
    
    // 应用位置并显示
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        const menu = document.getElementById('accountContextMenu');
        if (menu) menu.remove();
        document.removeEventListener('click', closeMenu);
      });
    }, 100);
  },

  /**
   * 关闭右键菜单
   */
  closeContextMenu() {
    const menu = document.getElementById('accountContextMenu');
    if (menu) menu.remove();
  },

  /**
   * 右键菜单 - 查看详情
   */
  async contextMenuViewDetails(accountId) {
    const result = await window.ipcRenderer.invoke('get-accounts');
    if (result.success && result.accounts) {
      const account = result.accounts.find(acc => acc.id === accountId);
      if (account) {
        // 创建模拟事件对象
        const mockEvent = {
          target: {
            closest: () => ({
              getAttribute: (attr) => {
                if (attr === 'data-account') return JSON.stringify(account);
                return null;
              }
            })
          }
        };
        this.viewAccountDetails(mockEvent);
      }
    }
    this.closeContextMenu();
  },

  /**
   * 右键菜单 - 刷新积分
   */
  async contextMenuRefresh(accountId) {
    const result = await window.ipcRenderer.invoke('get-accounts');
    if (result.success && result.accounts) {
      const account = result.accounts.find(acc => acc.id === accountId);
      if (account) {
        const mockEvent = {
          target: {
            closest: () => ({
              getAttribute: (attr) => {
                if (attr === 'data-account') return JSON.stringify(account);
                return null;
              }
            })
          }
        };
        await this.refreshAccountInfo(mockEvent);
      }
    }
    this.closeContextMenu();
  },

  /**
   * 右键菜单 - 切换账号
   */
  async contextMenuSwitch(accountId) {
    if (typeof switchToAccount === 'function') {
      await switchToAccount(accountId);
    }
    this.closeContextMenu();
  },

  /**
   * 右键菜单 - 导出账号
   */
  async contextMenuExport(accountId) {
    const result = await window.ipcRenderer.invoke('get-accounts');
    if (result.success && result.accounts) {
      const account = result.accounts.find(acc => acc.id === accountId);
      if (account) {
        const mockEvent = {
          target: {
            closest: () => ({
              getAttribute: (attr) => {
                if (attr === 'data-account') return JSON.stringify(account);
                return null;
              }
            })
          }
        };
        await this.exportSingleAccount(mockEvent);
      }
    }
    this.closeContextMenu();
  },

  /**
   * 右键菜单 - 删除账号
   */
  async contextMenuDelete(accountId, email) {
    const confirmed = confirm(`确定要删除账号 ${email} 吗？\n\n此操作不可恢复！`);
    if (confirmed) {
      const result = await window.ipcRenderer.invoke('delete-account', accountId);
      if (result.success) {
        if (typeof showToast === 'function') {
          showToast('删除成功！', 'success');
        }
        await this.loadAccounts();
      } else {
        alert('删除失败: ' + result.error);
      }
    }
    this.closeContextMenu();
  },

  /**
   * 获取账号 Token（用于没有 apiKey 的账号）
   */
  async getAccountToken(event) {
    event.stopPropagation();
    
    const btn = event.target.closest('button');
    if (!btn) return;
    
    const accountId = btn.getAttribute('data-id');
    const accountJson = btn.getAttribute('data-account');
    
    if (!accountJson) {
      alert('无法获取账号信息');
      return;
    }
    
    try {
      const account = JSON.parse(accountJson);
      
      // 打开登录获取 Token 弹窗
      this.openLoginTokenModal(account);
      
      // 调用 IPC 获取 Token
      const result = await window.ipcRenderer.invoke('login-and-get-tokens', account);
      
      if (result.success) {
        // 更新状态
        const statusEl = document.getElementById('loginTokenStatus');
        if (statusEl) {
          statusEl.textContent = '✅ 成功';
          statusEl.style.color = '#34c759';
        }
        
        // 添加成功日志
        this.addLoginTokenLog('========== Token 获取成功 ==========', 'success');
        this.addLoginTokenLog(`账号: ${result.account.email}`, 'success');
        this.addLoginTokenLog(`用户名: ${result.account.name || '未知'}`, 'success');
        this.addLoginTokenLog('账号信息已更新到本地文件', 'success');
        this.addLoginTokenLog('', 'info');
        this.addLoginTokenLog('💡 您可以关闭此窗口了', 'info');
        
        // 刷新账号列表
        await this.loadAccounts();
      } else {
        // 更新状态
        const statusEl = document.getElementById('loginTokenStatus');
        if (statusEl) {
          statusEl.textContent = '❌ 失败';
          statusEl.style.color = '#ff3b30';
        }
        
        // 添加失败日志
        this.addLoginTokenLog('========== Token 获取失败 ==========', 'error');
        this.addLoginTokenLog(`错误: ${result.error}`, 'error');
        this.addLoginTokenLog('', 'info');
        this.addLoginTokenLog('💡 请检查账号密码是否正确，然后重试', 'warning');
      }
    } catch (error) {
      console.error('获取 Token 失败:', error);
      
      // 更新状态
      const statusEl = document.getElementById('loginTokenStatus');
      if (statusEl) {
        statusEl.textContent = '❌ 错误';
        statusEl.style.color = '#ff3b30';
      }
      
      this.addLoginTokenLog('========== 发生错误 ==========', 'error');
      this.addLoginTokenLog(`错误: ${error.message}`, 'error');
    }
  },

  /**
   * 打开登录获取 Token 弹窗
   */
  openLoginTokenModal(account) {
    const modal = document.getElementById('loginTokenModal');
    const emailEl = document.getElementById('loginTokenEmail');
    const statusEl = document.getElementById('loginTokenStatus');
    const logEl = document.getElementById('loginTokenLog');
    
    if (!modal) return;
    
    // 设置账号信息
    if (emailEl) emailEl.textContent = account.email;
    if (statusEl) {
      statusEl.textContent = '进行中...';
      statusEl.style.color = '#007aff';
    }
    
    // 清空日志
    if (logEl) logEl.innerHTML = '';
    
    // 显示弹窗
    modal.style.display = 'flex';
    
    // 初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // 监听日志消息
    if (window.ipcRenderer) {
      window.ipcRenderer.on('login-log', (event, message) => {
        this.addLoginTokenLog(message, 'info');
      });
    }
  },

  /**
   * 添加登录 Token 日志
   */
  addLoginTokenLog(message, type = 'info') {
    const logEl = document.getElementById('loginTokenLog');
    if (!logEl) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString('zh-CN');
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${time}]`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = `log-message log-${type}`;
    messageSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    logEl.appendChild(logEntry);
    
    // 自动滚动到底部
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccountManager;
}

// 挂载到全局（用于 HTML onclick 调用）
window.AccountManager = AccountManager;

// 兼容旧的全局函数调用
function loadAccounts() {
  return AccountManager.loadAccounts();
}

function showAddAccountForm() {
  return AccountManager.showAddAccountForm();
}

function hideAddAccountForm() {
  return AccountManager.hideAddAccountForm();
}

function addManualAccount() {
  return AccountManager.addManualAccount();
}

function deleteAllAccounts() {
  return AccountManager.deleteAllAccounts();
}

function exportAccounts(type = 'all') {
  return AccountManager.exportAccounts(type);
}

// 注意：showImportAccountForm 在 renderer.js 中已有实现
// 不需要在这里创建包装器，避免覆盖原有实现
