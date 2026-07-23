/**
 * Curated Steam economy image hashes for catalog model-filter previews.
 * Keys are ItemDefinition.weapon labels (same as CATALOG_CATEGORY_OPTIONS).
 * Hashes are stable CDN paths — append /96fx96f for lightweight thumbs.
 */
export const CATALOG_MODEL_PREVIEW_ICON_HASHES: Readonly<Record<string, string>> =
  {
    'CZ75-Auto': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLyhMG1_B1a_s2rfKdlJfSsDX3HlNF6ueZhW2fkk04i5WrXmY2sc3qfPFAlWZd3EOdY4Bi6loCxPu7h51fZjNlGzST5kGoXuTXAF0gA', // CZ75-Auto | Victoria
    'Desert Eagle': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7vORbqhsLfWAMWuZxuZi_uI_TX6wxxkjsGXXnImsJ37COlUoWcByEOMOtxa5kdXmNu3htVPZjN1bjXKpkHLRfQU', // Desert Eagle | Blaze
    'Dual Berettas': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL0kp_0-B1c_M2qfaVhIvWBC3OEwP1Js-5rXSiMmRQguynLydn9JXmUOwMgCsN1EbMPsRHtxoDuZrzm4VTait4Tzn_-jn4f7ipu4fFCD_Qo-zseRg', // Dual Berettas | Cobra Strike
    'Five-SeveN': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3l4Dl7idN6vyRa7FSJvmFC1iDxPhzvt5oQS6hjCIrujqNjsH_cy2RagUjA8BwR-de5hjskNflNrnqsgaLiYgRyyythitM7Hw-sekKT-N7rXEld5dH', // Five-SeveN | Angry Mob
    'Glock-18': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1Y-s2pZKtuK6HLMXCR0-N3ueVsQRa_nBovp3PQydf4dXuSalUgCJZwRrILthi9kYDlMe_m4g2Ij90Um3moiXkc6SZj_a9cBgLxwlYC', // Glock-18 | Bullet Queen
    'P2000': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL5lYayrXIL0PG7V7Q_cKDDMWGZ0-tJte1sQiy9gRwrjDGMnYftb3-RZldxWJVyF-QLsUG5mofnML_qtg3cjd4TyCr4jXsf63lr4-5TVvA7uvqA-y0nTh8', // P2000 | Fire Elemental
    'P250': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiFO0OL8PfRSIeOaB2qf19F6ueZhW2fixx53tWqEm4ugeXuebQN0CZJyRrMJuxm4loCyPr_i51TfjtgXzi79kGoXuUXmUJzm', // P250 | Asiimov
    'R8 Revolver': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLjm4Dv8TRe_c2vaZtrIfSWMWqV1e96vOhqcDu2gxIrpTiXpYPwJiPTcAIpDJckF-9cuhfqltDuZujgs1DZj4hDy338jnhM73xusOcKVaos-qPJz1aW9R0yRq8', // R8 Revolver | Amber Fade
    'Tec-9': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLlm5W5wiVI0Oara_1SJPWQB2qR1eFkj-1gSCGn20h16j-Ew9j6Jy6QbQB1XJJzQLVYshXqm92xY-7g4wze3dpAySz2iXlXrnE8_HmWmcE', // Souvenir Tec-9 | Decimator
    'USP-S': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_uV_vO1WTCa9kxQ1vjiBpYPwJiPTcFB2Xpp5TO5cskG9lYCxZu_jsVCL3o4Xnij23ClO5ik9tegFA_It8qHJz1aWe-uc160', // Souvenir USP-S | Kill Confirmed
    'AK-47': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiVI0POlPPNSIvycAWOD0eFkpN5lRi67gVN15mmDw9egci_EPFAkDMQlTeZe4EXplNa0Yrvr5wbd345GyHioiC4b8G81tFuqg_k_', // AK-47 | Bloodsport
    'AUG': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf_jdk7vynZaFSIeWUMWuZxuZi_rZvSXDgzUV_tWWAydyqI3mQbVMiWJolTLQOtBS4w4a1MuznsVHa3YlbjXKpUc8HttI', // AUG | Akihabara Accept
    'FAMAS': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3n5vh7h1c_M2oaalsM8-fC2CRwvdJt-5lSxa_nBovp3PUztn4d3qSPQ8kDMR5ROVb4xCxw9a0NLni4lCIio4QzXn32yMb6Sds_a9cBr1TwPEt', // FAMAS | Commemoration
    'Galil AR': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2n5rp8SNJ0PG7V6NsLPmfMWaS0-9lue5ncCS2kRQyvnPXnIn7eSrEZ1AnD5NxTeII4ESwxN3jN7zl5QHXjdhAnyuo2y9Nv3xs_a9cBuAhdjfO', // Galil AR | Chatterbox
    'M4A1-S': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_OGMWrEwL9lj_JmWiWnlBYioQKJk4jxNWXFZ1IgC5MiQuZeuhK4wIXnMuPhslCM2oMTxH75hnxK6Htjse4BVqd25OSJ2DU2Q_CD', // M4A1-S | Chantico\'s Fire
    'M4A4': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6V6V-Kf2cGFidxOp_pewnTii3w0x_tmTRnt2qdHyWaFAjA5UlQOYI5BO5k9bhZunm41OI34NDnjK-0H3pAWw_Rw', // M4A4 | Asiimov
    'SG 553': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLimcO1qx1Y-s29b_E4c8-BC2aT1eFkj-1gSCGn20Qit2yAn9n8IHKealB2DZIjTO8JsBW7ktDlYu_m5ADWit4Rznn63XtXrnE82sW2soE', // SG 553 | Colony IV
    'AWP': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6V-Kf2cGFidxOp_pewnF3nhxEt0sGnSzN76dH3GOg9xC8FyEORftRe-x9PuYurq71bW3d8UnjK-0H0YSTpMGQ', // AWP | Asiimov
    'G3SG1': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2zYXnrB1c_M2pO7dqcc-VAnKI_v5jovFlSha_nBovp3ODz9uoc3vGOgMmApp3QrFe5xftm9bjNOm24Afb3YlBn3mqjS8dvy1p_a9cBmtTF-_C', // G3SG1 | Flux
    'SCAR-20': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLinZfyr3Jk6OGRe6dsMqLDMWWczuFyo_FmXT2MmRQguynLnoqrcHPCaFdzDMF5F-8P4Bbum9fkYuvrsVffjI5AyS75inlL5ixjsvFCD_R20nqesQ', // SCAR-20 | Bloodsport
    'SSG 08': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLijZGwpR1Y-s29YKV_K8-fB2CY1aAmsbFtFnDilkUl5j7UzoqsInmVaFd0XMMlELYDshbuxNPvP-yxtlCMlcsbmlWiixNl', // SSG 08 | Blood in the Water
    'MAC-10': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1Y-s2jaac8cM-dC2ie0-dytfNWQyC0nQlp5DzTntmgdC7COABxX5NxQrUOtUS5w4LgMu6zsVCK2IJCmyisjitM6DErvbicsEA0SQ', // MAC-10 | Neon Rider
    'MP5-SD': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8jsPz-R1c_M2jePF-JM-SHXOCzuN3pOhqcCW6khUz_WzTzYmhJXuSaANzW8EkQ7JZ4BjsxtSzYezr5lbfidlEzC-vjnxK7ih1o7FVYPX5q0o', // MP5-SD | Gauss
    'MP7': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8jsHf-jFk4uL5V6ZhL_-XHXef0_pJvOhuRz39lxsk4W3Ry96pIHrFOgElDZN2Q-9etUSwk4LnYu3h5wLejYwWxSr43zQJsHiIGMoJQA', // MP7 | Bloodsport
    'MP9': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8js_f_jdk4uL3V6psMvOaHVicyOl-pK8xGXq2xE536m7dnI2vdS6WagZ2CMFyFrNcsBjuw4G1Ne23tQGN3olH02yg2ZxyeudA', // MP9 | Airlock
    'P90': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhx8bf_jdk_6v-JaV-KfmeAXGvzedxuPUnTSjikRgksjuBzoz4dXLFb1QoC8QlTLQD4EPqk4LvN-Pns1aMioNBzTK-0H3gQVv65g', // P90 | Asiimov
    'PP-Bizon': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzl4zv8x1Y-s2sYb5iLs-QG3WDxNF6ueZhW2fkzU0isDvTnomsdS7BbwF0A8ElROJfshC8wN3jYu-2tQ3c2osTxCitkGoXuVioOA3_', // PP-Bizon | Judgement of Anubis
    'UMP-45': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkk4a0qB1a7s2oaaBoH-WeHlicyOl-pK8_HHzmzU52sTjWntegc32faAR2DMEkELMI4xmxw4G1Yrnn4FCM3d4Q02yg2U-vv27j', // Souvenir UMP-45 | Fade
    'MAG-7': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5G3wiVI0P-vb_NSJ_ySHXSvzedxuPUnSijmlh9x4D-BnNyuJ3LCbAVzAsdxFuRe5EPpw9XiMbvh5lHYiYwQyjK-0H3Th2Gpiw', // MAG-7 | Cinquedea
    'Nova': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL_kYDhwiFO0PyhfqVSIf6HB3aFxNF6ueZhW2fmwRwl6jyHw96vIn2UbVVzXMdyRuYLt0O7ltPjZbu0tQTejo9Hyn2skGoXucYtjcOH', // Nova | Antique
    'Sawed-Off': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLin4Hl-S1d6c2tfZt-IeeWCmiWx9FytfdmWju2hyIrujqNjsH8JSnBPQdxDcEiF-FZshS7kdG1NOyz4wKKiYNDmXn3jHkd5n055ulTT-N7rdPAUyyq', // Sawed-Off | Devourer
    'XM1014': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLpk8ewrHZk7OeRcKk8cKHHMWad1OJzpN5rQzy2qhEutDWR1N-hI3yWbVRyD8YiEOVZ50TqmoKyZb7rtVfWgosQzX7-3X9K5yc4tr4cEf1yVvkijss', // Souvenir XM1014 | Entombed
    'Bayonet': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLzn4_v8ydP0POvV6JsJPWsAm6Xyfo45-BrHniwzUh24jjVm4qgInnCOA4mDscmEeVcsBXtkN22P-yx5waNg5UFk3tAoG85FQ', // ★ Bayonet | Fade
    'Bowie Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-uC4YbJsLM-RAXCZxNF3sd5vTi22qhEutDWR1NiocCqeZwYoC5pxRuMM5BPqxtTgY-20sgXZ2NpHnyqqiCpA5nk56u8cEf1y_UmCvro', // ★ Bowie Knife | Fade
    'Butterfly Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2avx-9ytd5lRi67gVNwsDvSwtqqc3iXZg4kCZYjReYLtRbum9XgYuvm5wbWjtgUzCn3iSsf8G81tFEeH9rw', // ★ Butterfly Knife | Fade
    'Classic Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y_OGRaaVSJvGXC1icyOl-pK9tHn-yxhkltmTVnon4IHqUbgInWcN1ELIK5hS9xIbkZumx4wONjd9H02yg2Yau6XG6', // ★ Classic Knife | Fade
    'Falchion Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d7v6tYK1iLs-SD1iWwOpzj-1gSCGn20l-tmjVmIqhdHmWa1AkCJRyFuUItBW9wNTmY7jh5ADa3o5Fy3-sinhXrnE8OtZmGks', // ★ Falchion Knife | Fade
    'Flip Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1d4_u-V6VsH_aSCmKvzedxuPUnTXywzR9-427Qyd34d3iUb1RyDJMlQbQL5xTtw920Zby05FeNjohDzDK-0H3GjMwqlg', // ★ Flip Knife | Fade
    'Gut Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c-uaRaaVSJvGXC1icyOl-pK88HyjikUR_6z_UmIyudy-WPVByCpRzQ7UDukbtmofmM-3r4gaKjINH02yg2St2xdPu', // ★ Gut Knife | Fade
    'Huntsman Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1P7vG6YadsLM-SD1iWwOpzj-1gSCGn2x8hsW6DmIqpcXjBZgYkCZt5F7VcthS8ldS2Nr7m5VCMi4gRyyuqjHtXrnE8oar8MtU', // ★ Huntsman Knife | Fade
    'Karambit': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SD1iWwOpzj-1gSCGn20tztm_UyIn_JHKUbgYlWMcmQ-ZcskSwldS0MOnntAfd3YlMzH35jntXrnE8SOGRGG8', // ★ Karambit | Fade
    'Kukri Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q-vm8YZtsIc-VD2OV_uJ_t-l9AXyyzEohsGvVn4moIi-VO1N2CJR1E-UD4BXtkIXhMe2x7lbej4tEnyzgznQeN9c5PgA', // ★ Kukri Knife | Fade
    'M9 Bayonet': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWaR_uh3tORWQyC0nQlp4znQytr6cnjFbg8oC8BzRrQK50S-lNDgP-_r5wWP3t5CyX37jCIb7DErvbiJu9Hv_g', // ★ M9 Bayonet | Fade
    'Navaja Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1c9uK9cZtnIfOYBWmZx-tJseBWSSi3kCIrujqNjsH7c3qVOwV2DcZyQbQOukG5m4CyMeqz4laIgoxAnH_93Ckbvyw5troCT-N7rT3KN2DN', // ★ Navaja Knife | Fade
    'Nomad Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1U-uaqZ6t_H_GSMWGRxetJvOhuRz39wUUksW7Vm4n7d3yUO1InXsdxTeQDukO4l9zuN7_j5QzYjIlFy3n6jDQJsHjNMoy1vA', // ★ Nomad Knife | Fade
    'Paracord Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y4OCqV6VsH_aSCmKvzedxuPUnHSixkUl-4mqEnNj8IH3BOgUjX5RzFOMDthewlN3iYu-27gHcio1DmTK-0H2HlTMq_Q', // ★ Paracord Knife | Fade
    'Shadow Daggers': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1L-uGmV6VsH_aSCmKvzedxuPUnFy-3l0tz5DmGzNmhdnmVblB0CcMjTbQJsBe6k9zlMuLl4gHYjoIRmDK-0H3ZqbeWvA', // ★ Shadow Daggers | Fade
    'Skeleton Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I5PeibbBiLs-SD1iWwOpzj-1gSCGn20kjt2-En9mpcCmQag8hXsciQeJYthW9kILkMLji4g3Ygo8Uznj6jX9XrnE8raC5r1M', // ★ Skeleton Knife | Fade
    'Stiletto Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1I-_uibbB5L8-SD1iWwOpzj-1gSCGn20h2smqHzNuqcy6TawckApJ5EeIJuxPpwNaxMejmtQLa2o5Nnnj3hy9XrnE8H9hk9aQ', // ★ Stiletto Knife | Fade
    'Survival Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Y7vyne5tsIc-VD2OV_uJ_t-l9AXuwwBh0sT-BydarInPGPQUpCMcjELJY5xm4xIG0NLy241Dag9hNzirgznQeOQeAleU', // ★ Survival Knife | Fade
    'Talon Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1M5vahf6lsK_WBMWaR_uh3tORWQyC0nQlpsmXcnNaoeHuTZwUiWMZzRrVZsxm9x9ThNrzj4QCPjdhNmHj73S9KujErvbhX2ACGeQ', // ★ Talon Knife | Fade
    'Ursus Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1O_eG7e5tsIc-VD2OV_uJ_t-l9AXzml00i527XzouseH7GblAjX5N3R-NbuhLswYfjY-zj7laKjdkRyX_gznQeK-1-7hY', // ★ Ursus Knife | Fade
    'Bloodhound Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOnJrv8iZT4OegbJtqLP-FC3Svw-J5v-VhQDy9kSIlvzyGkbDqKCfRO0RPVssnHaMUsES-k9HjNrixsgbd3YIRni7-inlO5i5t6-pRAqIs_aOFjg_JZbU5sI5Deqh-Veq-pA', // ★ Bloodhound Gloves | Charred
    'Broken Fang Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOnITv9idV6fOgb5tqLP-FC3Svzv5zouB9Ria9xE0YvjiRm4PwIhTALFN1VP0sHLBS9g65w9exM-Pl5gaKidkRziX22yNIv306571QA6pwrKGDiluTZLxs5ZdXOr_5GlzOqAIa', // ★ Broken Fang Gloves | Jade
    'Driver Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5T441rsfhr9kYDl7h1I4_utY5t-LvGYC3SbyOBJp-lgWyyMmRQguynLz4r6Iy7EbFchApNyR-dbtEbuw4XkN7jq7gHdjtoQzi37hiwYvytvt_FCD_Ql24JgJg', // ★ Driver Gloves | King Snake
    'Hand Wraps': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu4vx603vRA_Olpfu-TVJ7uK9V6xsLvSEHGaA_uJzsfVhSjuqqhsmsS-MmbD7LT7CAUV7T84sBohW60fg1srnZb6zsw2Ng41MmST43C1L7is9574CBKIh_q2Big_IMOdutcNRd_iuU13QD7PQAmaY', // ★ Hand Wraps | Cobalt Skulls
    'Hydra Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOlo_k7yNk6P6hfqF-H_KfAWiUyeFjvuVWRzC3hxwYsDyWn7DxIDnDO1h1Xv0sHLBS9g7ul9zmMbi35FHYgolMmSj9jS8fvC5jte9RAqctqKCC2QHBYrU64MMCOr_5GlPhveuZ', // ★ Hydra Gloves | Case Hardened
    'Moto Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu4r7_lb1QgTykpPf-i5U-fe9V6liNP-BDX6TzetJvehnWxanhxQmvTqJn7D1KCzPKhgnW5UmRO4DsxXrlYbhPurmtAXai98UzS73in5I6S5p4OsAU_Zx-KHWkUifZsxBQgc2', // ★ Moto Gloves | Spearmint
    'Specialist Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk71ruQBH4jYLf-i5U-fe9V7d9JfOaD2uZ0vpJu-hkQCe8qhkusjCKlIvqHjnCOml8U8UoAfkItBLswdbuNbjr5FHdjNkUzSv73C1K5y46tu4EUvAg-6bU3FrBMOE4_9BdcyhkRns5', // ★ Specialist Gloves | Crimson Kimono
    'Sport Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H-CcB3Sfz9Fwou5ucCu_gBgYpDWMjorGLSLANkI-W5R4E7JZtxbskNWxZeLi4QPejdgTmSn62iwbvyw957kDAqog_fXWjBaBb-Pahe96zA', // ★ Sport Gloves | Amphibious
  } as const;

export const CATALOG_MODEL_PREVIEW_SIZE_PX = 96;

export function getCatalogModelPreviewHash(weapon?: string | null): string | null {
  if (!weapon) {
    return null;
  }
  return CATALOG_MODEL_PREVIEW_ICON_HASHES[weapon] ?? null;
}

export function listCatalogModelPreviewHashes(weapons: readonly string[]): string[] {
  const hashes: string[] = [];
  for (const weapon of weapons) {
    const hash = getCatalogModelPreviewHash(weapon);
    if (hash) {
      hashes.push(hash);
    }
  }
  return hashes;
}

