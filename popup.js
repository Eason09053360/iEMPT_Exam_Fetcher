document.getElementById('downloadBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = "正在掃描頁面連結...";

  // 1. 取得當前分頁
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 2. 執行腳本抓取網址
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeLinks,
  }, async (results) => {
    // 錯誤檢查
    if (!results || !results[0] || !results[0].result || results[0].result.length === 0) {
      statusDiv.textContent = "找不到包含 'exam' 的連結。\n請確認頁面上是否有考題連結。";
      return;
    }

    const links = results[0].result;
    statusDiv.textContent = `找到 ${links.length} 個連結，準備處理...\n請勿關閉視窗。`;

    try {
      // 3. 建立 PDF 文件
      const { PDFDocument, PageSizes } = PDFLib;
      const mergedPdf = await PDFDocument.create();
      let successCount = 0;

      // 4. 迴圈處理每個連結
      for (let i = 0; i < links.length; i++) {
        const url = links[i];
        statusDiv.textContent = `正在處理第 ${i + 1} / ${links.length} 張圖片...`;
        
        try {
            // 下載圖片資料
            const response = await fetch(url);
            if (!response.ok) throw new Error("下載失敗");
            const imageBuffer = await response.arrayBuffer();

            let pdfImage;
            // 嘗試辨識圖片格式 (JPG 或 PNG)
            try {
                pdfImage = await mergedPdf.embedJpg(imageBuffer);
            } catch (e) {
                try {
                    pdfImage = await mergedPdf.embedPng(imageBuffer);
                } catch (e2) {
                    console.warn("跳過非圖片檔案:", url);
                    continue; // 格式不對就跳過
                }
            }
            
            // 新增一頁 A4
            const page = mergedPdf.addPage(PageSizes.A4);
            const { width, height } = page.getSize();
            
            // 計算縮放 (留邊距 40px)
            const maxWidth = width - 40;
            const maxHeight = height - 40;
            const imgDims = pdfImage.scaleToFit(maxWidth, maxHeight);

            // 將圖片畫在頁面中間
            page.drawImage(pdfImage, {
                x: (width - imgDims.width) / 2,
                y: (height - imgDims.height) / 2,
                width: imgDims.width,
                height: imgDims.height,
            });
            
            successCount++;

        } catch (err) {
             console.error("單張處理失敗:", err);
        }
        
        // 稍微休息一下，避免瀏覽器卡住
        await new Promise(r => setTimeout(r, 200));
      }

      // 5. 輸出結果
      if (successCount === 0) {
          statusDiv.textContent = "失敗：沒有成功抓取到任何圖片。\n請確認連結是否直接指向圖片檔。";
          return;
      }

      statusDiv.textContent = "圖片處理完成，正在產生 PDF...";
      
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      
      const date = new Date().toISOString().split('T')[0];
      const filename = `Exam_Merged_${date}.pdf`;

      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: true
      });

      statusDiv.textContent = `成功！已合併 ${successCount} 頁考題。\n檔案: ${filename}`;

    } catch (err) {
      console.error(err);
      statusDiv.textContent = `系統錯誤: ${err.message}`;
    }
  });
});

// 這是注入到網頁執行的函式
function scrapeLinks() {
  const anchors = document.querySelectorAll('a');
  const links = [];
  anchors.forEach(a => {
    // 條件：文字包含 'exam' 且有網址
    if (a.innerText && a.innerText.toLowerCase().includes('exam') && a.href) {
      links.push(a.href);
    }
  });
  // 去除重複連結
  return [...new Set(links)];
}