import os
import fitz  # PyMuPDF
import arxiv
import urllib.request
import json
import re

papers = {
    "tacdino": {"arxiv_id": "2606.12069", "title": "Tac-DINO: Learning Tactile Features with Patch Alignment", "authors": "Hong Li, Y. Dong, Y. Xu, Y. Tang, M. Li, J. Qiu, Q. Yao, X. Zhu, Y. Shen, N. Xue, ...", "venue": "ArXiv 2026", "manual_page": True},
    "aetherock": {"arxiv_id": "2606.09777", "title": "AetheRock: An Arm-Worn Robot Teaching System for Force-Guided Vision-Tactile Learning", "authors": "Hong Li, Y. Xu, Y. Tang, Y. Dong, C. Liu, C. Yu, X. Li, S. Huang, Y. Shen, N. Xue, ...", "venue": "ArXiv 2026", "manual_page": True},
    "egoguide": {"arxiv_id": "2606.14665", "title": "EgoGuide: Egocentric Guidance for Efficient Robot-Free Demonstration Collection and Learning", "authors": "Y. Xu, M. Nie, T. Li, Hong Li, Y. Luo, S. Huang, Y.-L. Li", "venue": "ArXiv 2026"},
    "beyond_static": {"arxiv_id": "2604.03302", "title": "Beyond Static Vision: Scene Dynamic Field Unlocks Intuitive Physics Understanding in Multi-modal Large Language Models", "authors": "N. Li, X. Wang, Y. Chen, H. Zhang, Hong Li, Y.-L. Li", "venue": "ArXiv 2026"},
    "atlas": {"arxiv_id": "2410.10923", "title": "ATLAS: Adapter-Based Multi-Modal Continual Learning with a Two-Stage Learning Strategy", "authors": "Hong Li, Zhiquan Tan, Xingyu Li, Weiran Huang", "venue": "ArXiv 2024", "local_teaser": "../images/atlas/fig-methods-revision.png"},
    "tomt": {"arxiv_id": "2308.09658", "title": "Tree-of-Mixed-Thought: Combining Fast and Slow Thinking for Multi-hop Visual Reasoning", "authors": "Pengbo Hu, Ji Qi, Xingyu Li, Hong Li, Xinqi Wang, Bing Quan, Ruiyu Wang, Yi Zhou", "venue": "ArXiv 2023", "local_teaser": "../images/tomt/tomt.png"},
    "agm": {"arxiv_id": "2308.07686", "title": "Boosting Multi-modal Model Performance with Adaptive Gradient Modulation", "authors": "Hong Li, Xingyu Li, Pengbo Hu, Yinuo Lei, Chunxiao Li, Yi Zhou", "venue": "ICCV 2023", "local_teaser": "../images/agm/agm.png"}
}

# Add Colorectal tumor segmentation manually since it's not on arXiv
papers["colorectal"] = {
    "title": "Colorectal tumor segmentation of CT scans based on a convolutional neural network with an attention mechanism",
    "authors": "Y. Pei, L. Mu, Y. Fu, K. He, Hong Li, S. Guo, X. Liu, M. Li, H. Zhang, X. Li",
    "venue": "IEEE Access 2020",
    "abstract": "Colorectal cancer is one of the most common digestive system tumors. Automatic segmentation of colorectal tumors in CT scans can help doctors make accurate diagnoses and treatment plans. In this paper, we propose a novel convolutional neural network with an attention mechanism for colorectal tumor segmentation. Experimental results demonstrate the effectiveness of our proposed method."
}


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        :root {{
            --bg-color: #FAF9F6;
            --text-color: #1c1917;
            --secondary-text: #57534e;
        }}
        body {{
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.6;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 800px;
            margin: 0 auto;
            padding: 4rem 2rem;
        }}
        h1 {{ font-size: 2.2rem; font-weight: 600; line-height: 1.2; margin-bottom: 1rem; }}
        .authors {{ font-size: 1.1rem; color: var(--secondary-text); margin-bottom: 0.5rem; }}
        .venue {{ font-size: 1rem; font-style: italic; color: var(--secondary-text); margin-bottom: 2rem; }}
        .links a {{
            display: inline-block;
            margin-right: 1rem;
            text-decoration: none;
            color: var(--text-color);
            border: 1px solid #e7e5e4;
            padding: 0.4rem 1rem;
            border-radius: 999px;
            font-size: 0.9rem;
        }}
        .links a:hover {{ background: var(--text-color); color: var(--bg-color); }}
        .teaser {{ margin: 3rem 0; text-align: center; }}
        .teaser img {{ max-width: 100%; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
        h2 {{ font-size: 1.5rem; margin-top: 3rem; margin-bottom: 1rem; border-bottom: 1px solid #e7e5e4; padding-bottom: 0.5rem; }}
        .abstract {{ font-size: 1.05rem; color: var(--secondary-text); line-height: 1.7; }}
        .home-link {{ display: block; margin-bottom: 3rem; text-decoration: none; color: var(--secondary-text); font-weight: 500; }}
        .home-link:hover {{ color: var(--text-color); }}
    </style>
</head>
<body>
<div class="container">
    <a href="../index.html" class="home-link">← Back to Home</a>
    <h1>{title}</h1>
    <div class="authors">{authors}</div>
    <div class="venue">{venue}</div>
    <div class="links">
        {links_html}
    </div>
    
    <div class="teaser">
        {teaser_html}
    </div>

    <h2>Abstract</h2>
    <div class="abstract">
        {abstract}
    </div>
</div>
</body>
</html>
"""

def get_largest_image(pdf_path, output_path):
    doc = fitz.open(pdf_path)
    largest_img = None
    max_area = 0
    # Search first 2 pages for the largest image (likely teaser)
    for i in range(min(2, len(doc))):
        page = doc[i]
        image_list = page.get_images(full=True)
        for img in image_list:
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            width = base_image["width"]
            height = base_image["height"]
            area = width * height
            if area > max_area:
                max_area = area
                largest_img = image_bytes
    if largest_img:
        with open(output_path, "wb") as f:
            f.write(largest_img)
        return True
    return False

for key, paper in papers.items():
    # Preserve the curated demo player and canonical project route.
    if paper.get("manual_page") and os.path.exists(f"{key}/index.html"):
        print(f"Skipping manually maintained page: {key}")
        continue
    print(f"Processing {key}...")
    os.makedirs(key, exist_ok=True)
    
    abstract = paper.get("abstract", "")
    links_html = ""
    teaser_html = ""
    
    if "arxiv_id" in paper:
        client = arxiv.Client()
        search = arxiv.Search(id_list=[paper["arxiv_id"]])
        result = next(client.results(search))
        abstract = result.summary.replace("\n", " ")
        links_html = f'<a href="{result.entry_id}" target="_blank">arXiv</a>'
        links_html += f'\n        <a href="{result.pdf_url}" target="_blank">PDF</a>'
        
        # Download PDF if no local teaser
        if "local_teaser" in paper:
            teaser_html = f'<img src="{paper["local_teaser"]}" alt="Teaser">'
        else:
            pdf_path = f"{key}/{key}.pdf"
            img_path = f"{key}/teaser.png"
            if not os.path.exists(pdf_path):
                print(f"Downloading PDF for {key}...")
                urllib.request.urlretrieve(result.pdf_url, pdf_path)
            
            if not os.path.exists(img_path):
                print(f"Extracting image for {key}...")
                success = get_largest_image(pdf_path, img_path)
                if success:
                    teaser_html = f'<img src="teaser.png" alt="Teaser">'
                else:
                    teaser_html = '<div style="padding: 3rem; background: #f5f5f5; border-radius: 12px; color: #888;">[Teaser Image Not Found]</div>'
            else:
                teaser_html = f'<img src="teaser.png" alt="Teaser">'
    else:
        teaser_html = '<div style="padding: 3rem; background: #f5f5f5; border-radius: 12px; color: #888;">[Teaser Image Not Available]</div>'

    html = TEMPLATE.format(
        title=paper["title"],
        authors=paper["authors"].replace("Hong Li", "<strong>Hong Li</strong>"),
        venue=paper["venue"],
        links_html=links_html,
        teaser_html=teaser_html,
        abstract=abstract
    )
    
    with open(f"{key}/index.html", "w") as f:
        f.write(html)
        
print("Done!")
